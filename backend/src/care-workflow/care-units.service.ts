import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RoleSlug } from '@prisma/client';
import { AuthenticatedActor, ClinicContextService } from '../core/clinic-context.service';
import { isStaffRole } from '../core/tenant-roles';
import { PrismaService } from '../prisma/prisma.service';
import { closureRequirementsFromSettings } from './domain/workflow-rules';
import { sealProtocolValidations } from './domain/protocol-validation';
import { CreateCareUnitDto, UpdateCareUnitDto, UpsertCareUnitAssignmentDto } from './dto/care-workflow.dto';

const UNIT_ADMIN_ROLES: readonly RoleSlug[] = [RoleSlug.SUPER_ADMIN, RoleSlug.ADMIN];

/**
 * Administration of care units and staff assignments. Administrators organise
 * units and who works in them; they do not gain clinical access by doing so.
 */
@Injectable()
export class CareUnitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clinicContext: ClinicContextService,
  ) {}

  private async admin(actorInput?: AuthenticatedActor) {
    const actor = await this.clinicContext.requireOperationalActor(actorInput);
    if (!actor.primaryRole || !UNIT_ADMIN_ROLES.includes(actor.primaryRole)) {
      throw new ForbiddenException('Seule l’administration de l’établissement gère les unités de soins.');
    }
    return actor;
  }

  private checkSettings(settings?: Record<string, unknown>) {
    if (!settings) return;
    const declared = (settings as { closureRequirements?: unknown }).closureRequirements;
    if (declared !== undefined && (!Array.isArray(declared) || closureRequirementsFromSettings(settings).length !== declared.length)) {
      throw new BadRequestException('closureRequirements doit être une liste de { eventType, label }.');
    }
    const billingPolicy = (settings as { billingPolicy?: unknown }).billingPolicy;
    if (billingPolicy !== undefined && billingPolicy !== 'BILL_AFTER' && billingPolicy !== 'PAY_FIRST') {
      throw new BadRequestException('billingPolicy doit valoir BILL_AFTER (facturer après les soins) ou PAY_FIRST (paiement préalable).');
    }
    const stages = (settings as { stages?: unknown }).stages;
    if (stages !== undefined && (!Array.isArray(stages) || stages.some((stage) => typeof stage !== 'string' || !stage.trim()))) {
      throw new BadRequestException('stages doit être une liste de libellés.');
    }
  }

  async list(actorInput?: AuthenticatedActor) {
    const actor = await this.admin(actorInput);
    return this.prisma.careUnit.findMany({
      where: { clinicId: actor.clinicId },
      include: { _count: { select: { assignments: { where: { active: true } } } } },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
  }

  async create(dto: CreateCareUnitDto, actorInput?: AuthenticatedActor) {
    const actor = await this.admin(actorInput);
    this.checkSettings(dto.settings);
    try {
      return await this.prisma.careUnit.create({
        data: {
          clinicId: actor.clinicId,
          kind: dto.kind,
          code: dto.code,
          name: dto.name.trim(),
          // Default protocols start unvalidated: only the unit's clinicians validate them.
          settings: dto.settings ? (sealProtocolValidations(dto.kind, null, dto.settings) as Prisma.InputJsonValue) : undefined,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`Le code d’unité ${dto.code} existe déjà dans l’établissement.`);
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateCareUnitDto, actorInput?: AuthenticatedActor) {
    const actor = await this.admin(actorInput);
    this.checkSettings(dto.settings);
    const unit = await this.prisma.careUnit.findFirst({ where: { id, clinicId: actor.clinicId }, select: { id: true, kind: true, settings: true } });
    if (!unit) throw new NotFoundException('Unité de soins introuvable.');
    return this.prisma.careUnit.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        active: dto.active,
        // Validation flags are recomputed: a changed protocol loses its clinical validation.
        settings: dto.settings
          ? (sealProtocolValidations(unit.kind, unit.settings as Record<string, unknown> | null, dto.settings) as Prisma.InputJsonValue)
          : undefined,
      },
    });
  }

  async assignments(id: string, actorInput?: AuthenticatedActor) {
    const actor = await this.admin(actorInput);
    const unit = await this.prisma.careUnit.findFirst({ where: { id, clinicId: actor.clinicId }, select: { id: true } });
    if (!unit) throw new NotFoundException('Unité de soins introuvable.');
    return this.prisma.careUnitAssignment.findMany({
      where: { careUnitId: id, clinicId: actor.clinicId },
      include: { user: { select: { id: true, firstName: true, lastName: true, primaryRole: true, status: true } } },
      orderBy: [{ active: 'desc' }, { unitRole: 'asc' }],
    });
  }

  async upsertAssignment(id: string, dto: UpsertCareUnitAssignmentDto, actorInput?: AuthenticatedActor) {
    const actor = await this.admin(actorInput);
    const unit = await this.prisma.careUnit.findFirst({ where: { id, clinicId: actor.clinicId }, select: { id: true } });
    if (!unit) throw new NotFoundException('Unité de soins introuvable.');
    const user = await this.prisma.user.findFirst({
      where: { id: dto.userId, clinicId: actor.clinicId, deletedAt: null },
      select: { id: true, status: true, primaryRole: true },
    });
    if (!user) throw new NotFoundException('Membre du personnel introuvable dans votre établissement.');
    if (dto.active && (user.status !== 'ACTIVE' || !isStaffRole(user.primaryRole))) {
      throw new BadRequestException('Seul un membre actif du personnel soignant ou opérationnel peut être affecté à une unité.');
    }
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
    if (endsAt && endsAt.getTime() <= Date.now()) throw new BadRequestException('La fin d’affectation doit être dans le futur.');
    return this.prisma.careUnitAssignment.upsert({
      where: { careUnitId_userId: { careUnitId: id, userId: dto.userId } },
      create: {
        clinicId: actor.clinicId, careUnitId: id, userId: dto.userId,
        unitRole: dto.unitRole, active: dto.active, endsAt, createdById: actor.id,
      },
      update: { unitRole: dto.unitRole, active: dto.active, endsAt },
    });
  }
}
