import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

export interface PacsSettings { enabled: boolean; previewUrlTemplate: string; token?: string; clearToken?: boolean }
export function validatePacsUrl(template: string) {
  let url: URL;
  try { url = new URL(template.replace('{studyUid}', '1.2.3')); } catch { throw new BadRequestException('Adresse PACS invalide.'); }
  if (!template.includes('{studyUid}') || url.protocol !== 'https:' || url.username || url.password || url.hash || url.search) {
    throw new BadRequestException('Utilisez une adresse HTTPS d’aperçu contenant {studyUid}, sans identifiants ni paramètres secrets.');
  }
  const host = url.hostname.toLowerCase();
  if (['localhost', '127.0.0.1', '[::1]', '0.0.0.0', '169.254.169.254'].includes(host) || host.endsWith('.localhost') || host.startsWith('169.254.')) {
    throw new BadRequestException('Cette adresse PACS est interdite.');
  }
  return template;
}

function vaultKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('Clé serveur manquante pour protéger le PACS.');
  return createHash('sha256').update(`aulia-pacs-v1:${secret}`).digest();
}
export function sealPacsToken(token: string, clinicId: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', vaultKey(), iv);
  cipher.setAAD(Buffer.from(clinicId));
  const bytes = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), bytes].map(value => value.toString('base64')).join('.');
}
export function openPacsToken(sealed: string, clinicId: string) {
  const [iv, tag, bytes] = sealed.split('.').map(value => Buffer.from(value, 'base64'));
  if (!iv || !tag || !bytes) throw new Error('Configuration PACS illisible.');
  const decipher = createDecipheriv('aes-256-gcm', vaultKey(), iv);
  decipher.setAAD(Buffer.from(clinicId));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(bytes), decipher.final()]).toString('utf8');
}

@Injectable()
export class PacsConfigService {
  constructor(private readonly prisma: PrismaService) {}
  private async requireDev(actorId?: string) {
    if (!actorId) throw new ForbiddenException('Compte développeur requis.');
    const actor = await this.prisma.user.findUnique({ where: { id: actorId }, select: { primaryRole: true, status: true, deletedAt: true, clinicId: true } });
    if (!actor || actor.primaryRole !== 'DEV' || actor.status !== 'ACTIVE' || actor.deletedAt || actor.clinicId) throw new ForbiddenException('Compte développeur plateforme requis.');
    return actorId;
  }
  private async clinic(clinicId: string) {
    const clinic = await this.prisma.clinic.findFirst({ where: { id: clinicId, deletedAt: null }, select: { id: true } });
    if (!clinic) throw new NotFoundException('Établissement introuvable.');
  }
  async metadata(actorId: string | undefined, clinicId: string) {
    await this.requireDev(actorId);
    await this.clinic(clinicId);
    const row = await this.prisma.clinicPacsConfiguration.findUnique({ where: { clinicId } });
    return { enabled: row?.enabled ?? false, previewUrlTemplate: row?.previewUrlTemplate ?? '', hasToken: Boolean(row?.tokenCiphertext), updatedAt: row?.updatedAt ?? null };
  }
  async configure(actorId: string | undefined, clinicId: string, input: PacsSettings) {
    const actor = await this.requireDev(actorId);
    await this.clinic(clinicId);
    if (typeof input.enabled !== 'boolean' || typeof input.previewUrlTemplate !== 'string' || (input.token !== undefined && typeof input.token !== 'string') || (input.clearToken !== undefined && typeof input.clearToken !== 'boolean')) throw new BadRequestException('Configuration PACS invalide.');
    const template = input.previewUrlTemplate.trim();
    if (input.enabled || template) validatePacsUrl(template);
    if (input.token && (input.token.length > 4096 || /[\r\n]/.test(input.token))) throw new BadRequestException('Jeton PACS invalide.');
    if (input.token && input.clearToken) throw new BadRequestException('Choisissez remplacer ou supprimer le jeton.');
    await this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pacs:${clinicId}`}))`;
      const current = await tx.clinicPacsConfiguration.findUnique({ where: { clinicId } });
      // Never silently send an old bearer credential to a changed PACS host.
      if (input.enabled && current?.tokenCiphertext && current.previewUrlTemplate !== template && !input.token && !input.clearToken) throw new BadRequestException('Adresse modifiée : remplacez ou supprimez le jeton.');
      const tokenCiphertext = input.clearToken ? null : input.token ? sealPacsToken(input.token.trim(), clinicId) : current?.tokenCiphertext ?? null;
      const data = { enabled: input.enabled, previewUrlTemplate: template || null, tokenCiphertext };
      await tx.clinicPacsConfiguration.upsert({ where: { clinicId }, create: { clinicId, ...data }, update: data });
      await tx.auditTrail.create({ data: { actorId: actor, entity: 'CLINIC', entityId: clinicId, action: 'UPDATE', after: { event: 'PACS_CONFIGURED', enabled: input.enabled, tokenChanged: Boolean(input.token || input.clearToken) } } });
    });
    return this.metadata(actor, clinicId);
  }
  async resolve(clinicId: string) {
    const row = await this.prisma.clinicPacsConfiguration.findUnique({ where: { clinicId } });
    if (!row?.enabled || !row.previewUrlTemplate) return null;
    return { template: validatePacsUrl(row.previewUrlTemplate), token: row.tokenCiphertext ? openPacsToken(row.tokenCiphertext, clinicId) : null };
  }
}