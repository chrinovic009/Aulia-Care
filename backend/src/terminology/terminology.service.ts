import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { RoleSlug } from '@prisma/client';
import { ClinicContextService } from '../core/clinic-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { CODE_SYSTEMS, CodeSystem, icd10Chapter, normalizeCode, parseCodeFile } from './clinical-codes';

const asSystem = (value: string | undefined): CodeSystem => {
  const system = String(value || 'ICD10').toUpperCase();
  if (!(CODE_SYSTEMS as readonly string[]).includes(system)) throw new BadRequestException(`Terminologie inconnue : ${system} (ICD10 ou LOINC).`);
  return system as CodeSystem;
};

/**
 * Standard terminologies (ICD-10 / CIM-10 for diagnoses, LOINC for exams).
 * Searching is open to every authenticated professional; loading an official
 * file is reserved to the platform DEV, because a terminology is shared by
 * every establishment of the installation.
 */
@Injectable()
export class TerminologyService {
  constructor(private readonly prisma: PrismaService, private readonly clinicContext: ClinicContextService) {}

  async search(systemInput: string | undefined, query: string | undefined, limit = 20) {
    const system = asSystem(systemInput);
    const text = String(query ?? '').trim();
    if (text.length < 2) return [];
    const code = normalizeCode(system, text);
    return this.prisma.clinicalCode.findMany({
      where: {
        system, active: true, isChapter: false,
        OR: [{ code: { startsWith: code } }, { display: { contains: text, mode: 'insensitive' } }],
      },
      select: { code: true, display: true, chapter: true, system: true },
      orderBy: [{ code: 'asc' }],
      take: Math.min(Math.max(limit, 1), 50),
    });
  }

  async find(system: CodeSystem, code: string) {
    return this.prisma.clinicalCode.findUnique({ where: { system_code: { system, code: normalizeCode(system, code) } } });
  }

  async import(systemInput: string | undefined, file: string, version: string | undefined, actorId?: string) {
    const actor = await this.prisma.user.findUnique({ where: { id: actorId ?? '' }, select: { primaryRole: true } });
    if (actor?.primaryRole !== RoleSlug.DEV) throw new ForbiddenException('Le chargement d’une terminologie officielle est réservé au développeur de la plateforme.');
    const system = asSystem(systemInput);
    if (!file || file.length > 20_000_000) throw new BadRequestException('Fichier vide ou trop volumineux (20 Mo au plus).');
    const { accepted, rejected } = parseCodeFile(system, file);
    let written = 0;
    for (let index = 0; index < accepted.length; index += 500) {
      const batch = accepted.slice(index, index + 500);
      await this.prisma.$transaction(batch.map((row) => this.prisma.clinicalCode.upsert({
        where: { system_code: { system, code: row.code } },
        update: { display: row.display, parentCode: row.parentCode, chapter: system === 'ICD10' ? icd10Chapter(row.code) : null, active: true, version: version ?? null },
        create: { system, code: row.code, display: row.display, parentCode: row.parentCode, chapter: system === 'ICD10' ? icd10Chapter(row.code) : null, isChapter: false, version: version ?? null },
      })));
      written += batch.length;
    }
    return { system, imported: written, rejected: rejected.slice(0, 200), rejectedCount: rejected.length };
  }

  /** Diagnoses of the establishment by ICD-10 chapter (health reporting). */
  async diagnosisStatistics(days: number, actorId?: string) {
    const actor = await this.clinicContext.requireOperationalActor({ userId: actorId });
    const since = new Date(Date.now() - Math.min(Math.max(days, 1), 366) * 86_400_000);
    const rows = await this.prisma.diagnosis.findMany({
      where: { codeSystem: 'ICD10', code: { not: null }, recordedAt: { gte: since }, deletedAt: null, patient: { clinicId: actor.clinicId } },
      select: { code: true, description: true },
      take: 50_000,
    });
    const chapters = await this.prisma.clinicalCode.findMany({ where: { system: 'ICD10', isChapter: true }, select: { code: true, display: true } });
    const byChapter = new Map<string, number>();
    const byCode = new Map<string, { code: string; display: string; count: number }>();
    for (const row of rows) {
      const chapter = icd10Chapter(row.code!) ?? '?';
      byChapter.set(chapter, (byChapter.get(chapter) ?? 0) + 1);
      const entry = byCode.get(row.code!) ?? { code: row.code!, display: row.description, count: 0 };
      entry.count += 1;
      byCode.set(row.code!, entry);
    }
    return {
      since: since.toISOString(), total: rows.length,
      chapters: chapters.map((chapter) => ({ chapter: chapter.code, display: chapter.display, count: byChapter.get(chapter.code) ?? 0 })).filter((item) => item.count > 0),
      topCodes: [...byCode.values()].sort((a, b) => b.count - a.count).slice(0, 20),
    };
  }
}
