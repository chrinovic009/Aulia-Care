import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ClinicProvisioningStatus, Prisma, RoleSlug } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { isValidIanaTimezone } from '../../core/operational-policy';
import { PlatformLayersService } from '../layers/platform-layers.service';
import { ConfigureClinicLayersDto } from './dto/configure-clinic-layers.dto';
import { CreateProvisionedClinicDto } from './dto/create-provisioned-clinic.dto';
import { CreateProvisionedSuperAdminDto } from './dto/create-provisioned-super-admin.dto';
import { UpdateProvisionedClinicDto } from './dto/update-provisioned-clinic.dto';

const trimOrNull = (value?: string | null) => {
  const normalized = value?.trim();
  return normalized ? normalized : null;
};

@Injectable()
export class PlatformProvisioningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly layers: PlatformLayersService,
  ) {}

  private async requireDev(actorId?: string) {
    if (!actorId) throw new ForbiddenException('Compte DEV authentifié requis.');
    const actor = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: { id: true, primaryRole: true, status: true, deletedAt: true, clinicId: true },
    });
    if (!actor || actor.deletedAt || actor.status !== 'ACTIVE' || actor.primaryRole !== RoleSlug.DEV || actor.clinicId) {
      throw new ForbiddenException('Seul un compte DEV plateforme, sans établissement, peut provisionner une clinique.');
    }
    return actor;
  }

  private async requireProvisionableClinic(clinicId: string) {
    const clinic = await this.prisma.clinic.findFirst({
      where: { id: clinicId, deletedAt: null },
      select: { id: true, name: true, status: true, provisioningStatus: true },
    });
    if (!clinic) throw new NotFoundException('Établissement introuvable ou archivé.');
    return clinic;
  }

  private identityData(dto: CreateProvisionedClinicDto | UpdateProvisionedClinicDto): Prisma.ClinicUncheckedUpdateInput {
    if (dto.timezone !== undefined && !isValidIanaTimezone(dto.timezone)) {
      throw new BadRequestException('La timezone doit être un identifiant IANA valide, par exemple Africa/Lubumbashi.');
    }
    return {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.brandDisplayName !== undefined ? { brandDisplayName: trimOrNull(dto.brandDisplayName) } : {}),
      ...(dto.establishmentType !== undefined ? { establishmentType: dto.establishmentType } : {}),
      ...(dto.documentLogoUrl !== undefined ? { documentLogoUrl: trimOrNull(dto.documentLogoUrl), documentLogoUpdatedAt: new Date() } : {}),
      ...(dto.legalName !== undefined ? { legalName: trimOrNull(dto.legalName) } : {}),
      ...(dto.registrationNumber !== undefined ? { registrationNumber: trimOrNull(dto.registrationNumber) } : {}),
      ...(dto.rccmNumber !== undefined ? { rccmNumber: trimOrNull(dto.rccmNumber) } : {}),
      ...(dto.taxNumber !== undefined ? { taxNumber: trimOrNull(dto.taxNumber) } : {}),
      ...(dto.nationalIdNumber !== undefined ? { nationalIdNumber: trimOrNull(dto.nationalIdNumber) } : {}),
      ...(dto.phone !== undefined ? { phone: trimOrNull(dto.phone) } : {}),
      ...(dto.email !== undefined ? { email: trimOrNull(dto.email)?.toLowerCase() ?? null } : {}),
      ...(dto.website !== undefined ? { website: trimOrNull(dto.website) } : {}),
      ...(dto.country !== undefined ? { country: trimOrNull(dto.country) } : {}),
      ...(dto.province !== undefined ? { province: trimOrNull(dto.province) } : {}),
      ...(dto.city !== undefined ? { city: trimOrNull(dto.city) } : {}),
      ...(dto.neighborhood !== undefined ? { neighborhood: trimOrNull(dto.neighborhood) } : {}),
      ...(dto.address !== undefined ? { address: trimOrNull(dto.address) } : {}),
      ...(dto.timezone !== undefined ? { timezone: dto.timezone } : {}),
      ...(dto.currency !== undefined ? { currency: dto.currency.toUpperCase() } : {}),
      ...(dto.documentFooter !== undefined ? { documentFooter: trimOrNull(dto.documentFooter) } : {}),
    };
  }

  async createClinic(actorId: string | undefined, dto: CreateProvisionedClinicDto) {
    const actor = await this.requireDev(actorId);
    const name = dto.name.trim();
    if (name.length < 2) throw new BadRequestException('Le nom de l’établissement doit contenir au moins deux caractères.');
    const identity = this.identityData(dto);

    return this.prisma.$transaction(async (tx) => {
      const clinic = await tx.clinic.create({
        data: {
          ...identity,
          name,
          brandDisplayName: trimOrNull(dto.brandDisplayName) || name,
          establishmentType: dto.establishmentType,
          status: 'SUSPENDED',
          provisioningStatus: ClinicProvisioningStatus.IDENTITY_CONFIGURED,
        },
      });
      await tx.auditTrail.create({
        data: {
          actorId: actor.id,
          entity: 'CLINIC',
          entityId: clinic.id,
          action: 'CREATE',
          after: { event: 'CLINIC_PROVISIONED', clinicId: clinic.id, establishmentType: clinic.establishmentType, provisioningStatus: clinic.provisioningStatus },
        },
      });
      return clinic;
    });
  }

  async getClinic(actorId: string | undefined, clinicId: string) {
    await this.requireDev(actorId);
    const clinic = await this.requireProvisionableClinic(clinicId);
    const [fullClinic, layers, superAdmin] = await Promise.all([
      this.prisma.clinic.findUniqueOrThrow({ where: { id: clinic.id } }),
      this.layers.getSnapshotForClinic(clinic.id, true),
      this.prisma.user.findFirst({ where: { clinicId: clinic.id, primaryRole: RoleSlug.SUPER_ADMIN, deletedAt: null }, select: { id: true, displayName: true, email: true } }),
    ]);
    return { clinic: fullClinic, layers, superAdmin };
  }

  async updateClinic(actorId: string | undefined, clinicId: string, dto: UpdateProvisionedClinicDto) {
    const actor = await this.requireDev(actorId);
    const clinic = await this.requireProvisionableClinic(clinicId);
    const identity = this.identityData(dto);
    if (!Object.keys(identity).length) throw new BadRequestException('Aucune donnée institutionnelle à modifier.');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.clinic.update({ where: { id: clinic.id }, data: identity });
      await tx.auditTrail.create({
        data: {
          actorId: actor.id,
          entity: 'CLINIC',
          entityId: clinic.id,
          action: 'UPDATE',
          before: { clinicId: clinic.id, name: clinic.name, provisioningStatus: clinic.provisioningStatus },
          after: { event: 'CLINIC_IDENTITY_UPDATED', clinicId: clinic.id, changedFields: Object.keys(identity) },
        },
      });
      return updated;
    });
  }

  async configureLayers(actorId: string | undefined, clinicId: string, dto: ConfigureClinicLayersDto) {
    const actor = await this.requireDev(actorId);
    const clinic = await this.requireProvisionableClinic(clinicId);
    if (clinic.provisioningStatus === ClinicProvisioningStatus.DRAFT) {
      throw new BadRequestException('Enregistrez d’abord l’identité de l’établissement.');
    }
    const snapshot = await this.layers.configureForClinic(clinic.id, dto.layers, actor.id);
    await this.prisma.clinic.update({
      where: { id: clinic.id },
      data: { provisioningStatus: ClinicProvisioningStatus.LAYERS_CONFIGURED },
    });
    return snapshot;
  }

  async createSuperAdmin(actorId: string | undefined, clinicId: string, dto: CreateProvisionedSuperAdminDto) {
    const actor = await this.requireDev(actorId);
    const clinic = await this.requireProvisionableClinic(clinicId);
    const configuration = await this.prisma.platformLayerConfiguration.findUnique({
      where: { clinicId: clinic.id },
      select: { id: true, configuredAt: true },
    });
    if (!configuration?.configuredAt) {
      throw new BadRequestException('Activez les couches de cet établissement avant de créer son Super Admin.');
    }

    const existing = await this.prisma.user.findFirst({
      where: { clinicId: clinic.id, primaryRole: RoleSlug.SUPER_ADMIN, deletedAt: null },
      select: { id: true },
    });
    if (existing) throw new ConflictException('Un Super Admin est déjà configuré pour cet établissement.');

    const email = dto.email.trim().toLowerCase();
    const username = dto.username.trim().toLowerCase();
    const displayName = `${dto.firstName.trim()} ${dto.lastName.trim()}`.trim();
    const passwordHash = await bcrypt.hash(dto.password, 12);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const role = await tx.role.upsert({
          where: { slug: RoleSlug.SUPER_ADMIN },
          create: { slug: RoleSlug.SUPER_ADMIN, name: 'Super administrateur établissement', description: 'Responsable institutionnel numérique de son établissement.' },
          update: {},
        });
        const superAdmin = await tx.user.create({
          data: {
            email,
            username,
            displayName,
            firstName: dto.firstName.trim(),
            lastName: dto.lastName.trim(),
            passwordHash,
            primaryRole: RoleSlug.SUPER_ADMIN,
            clinicId: clinic.id,
            roles: { create: { roleId: role.id, active: true } },
          },
          select: { id: true, email: true, username: true, displayName: true, primaryRole: true, clinicId: true },
        });
        await tx.clinic.update({ where: { id: clinic.id }, data: { provisioningStatus: ClinicProvisioningStatus.SUPER_ADMIN_CREATED } });
        await tx.auditTrail.create({
          data: {
            actorId: actor.id,
            entity: 'USER',
            entityId: superAdmin.id,
            action: 'CREATE',
            after: { event: 'SUPER_ADMIN_CREATED', clinicId: clinic.id, targetUserId: superAdmin.id, role: RoleSlug.SUPER_ADMIN },
          },
        });
        return superAdmin;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Cet e-mail ou ce nom d’utilisateur est déjà utilisé.');
      }
      throw error;
    }
  }

  async activateClinic(actorId: string | undefined, clinicId: string) {
    const actor = await this.requireDev(actorId);
    const clinic = await this.requireProvisionableClinic(clinicId);
    const [configuration, superAdmin] = await Promise.all([
      this.prisma.platformLayerConfiguration.findUnique({ where: { clinicId: clinic.id }, select: { id: true, configuredAt: true } }),
      this.prisma.user.findFirst({ where: { clinicId: clinic.id, primaryRole: RoleSlug.SUPER_ADMIN, status: 'ACTIVE', deletedAt: null }, select: { id: true } }),
    ]);
    if (!configuration?.configuredAt || !superAdmin) {
      throw new BadRequestException('L’établissement doit avoir des couches configurées et un Super Admin actif avant son activation.');
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.clinic.update({
        where: { id: clinic.id },
        data: { status: 'ACTIVE', provisioningStatus: ClinicProvisioningStatus.ACTIVE },
      });
      await tx.auditTrail.create({
        data: {
          actorId: actor.id,
          entity: 'CLINIC',
          entityId: clinic.id,
          action: 'UPDATE',
          after: { event: 'CLINIC_ACTIVATED', clinicId: clinic.id, superAdminId: superAdmin.id },
        },
      });
      return updated;
    });
  }
}
