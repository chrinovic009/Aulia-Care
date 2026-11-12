import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CareUnitRole, Prisma, RoleSlug } from '@prisma/client';
import { AuthenticatedActor, ClinicContextService, OperationalClinicActor } from '../core/clinic-context.service';
import { UnitAction, unitRoleAllows } from './domain/workflow-rules';

export type Db = Prisma.TransactionClient;

export interface UnitAccess {
  unit: { id: string; clinicId: string; kind: string; code: string; name: string; active: boolean; settings: Prisma.JsonValue | null };
  unitRole: CareUnitRole;
}

/** Roles allowed to issue a request or a hand-off outside any unit (e.g. from a consultation). */
export const CLINICAL_REQUESTER_ROLES: readonly RoleSlug[] = [
  RoleSlug.PHYSICIAN, RoleSlug.SURGEON, RoleSlug.ANESTHESIOLOGIST, RoleSlug.NURSE, RoleSlug.MIDWIFE,
];

const ACTION_LABELS: Record<UnitAction, string> = {
  read: 'consulter',
  write: 'agir dans',
  validate: 'valider dans',
  reassign: 'réaffecter dans',
  configure: 'configurer',
};

/**
 * Tenant and unit boundary of the Care Workflow Engine. The clinic always comes
 * from the authenticated account; access to a unit always comes from an active
 * assignment of that person to that unit.
 */
@Injectable()
export class CareAccessService {
  constructor(private readonly clinicContext: ClinicContextService) {}

  actor(actor?: AuthenticatedActor): Promise<OperationalClinicActor> {
    return this.clinicContext.requireOperationalActor(actor);
  }

  async findUnit(db: Db, actor: OperationalClinicActor, careUnitId: string) {
    const unit = await db.careUnit.findFirst({
      where: { id: careUnitId, clinicId: actor.clinicId },
      select: { id: true, clinicId: true, kind: true, code: true, name: true, active: true, settings: true },
    });
    if (!unit) throw new NotFoundException('Unité de soins introuvable dans votre établissement.');
    return unit;
  }

  async activeUnitRole(db: Db, userId: string, careUnitId: string, at = new Date()): Promise<CareUnitRole | null> {
    const assignment = await db.careUnitAssignment.findFirst({
      where: {
        careUnitId,
        userId,
        active: true,
        startsAt: { lte: at },
        OR: [{ endsAt: null }, { endsAt: { gt: at } }],
      },
      select: { unitRole: true },
    });
    return assignment?.unitRole ?? null;
  }

  async requireUnit(db: Db, actor: OperationalClinicActor, careUnitId: string, action: UnitAction): Promise<UnitAccess> {
    const unit = await this.findUnit(db, actor, careUnitId);
    if (!unit.active && action !== 'read') {
      throw new ForbiddenException(`L’unité « ${unit.name} » est désactivée.`);
    }
    const unitRole = await this.activeUnitRole(db, actor.id, careUnitId);
    if (!unitRoleAllows(unitRole, action)) {
      throw new ForbiddenException(`Vous n’êtes pas autorisé à ${ACTION_LABELS[action]} l’unité « ${unit.name} ».`);
    }
    return { unit, unitRole: unitRole as CareUnitRole };
  }

  async canUnit(db: Db, actor: OperationalClinicActor, careUnitId: string | null | undefined, action: UnitAction): Promise<boolean> {
    if (!careUnitId) return false;
    const unitRole = await this.activeUnitRole(db, actor.id, careUnitId);
    return unitRoleAllows(unitRole, action);
  }

  requireClinicalRequester(actor: OperationalClinicActor) {
    if (!actor.primaryRole || !CLINICAL_REQUESTER_ROLES.includes(actor.primaryRole)) {
      throw new ForbiddenException('Sans unité émettrice, seul un professionnel de santé peut émettre cette demande.');
    }
  }

  async requirePatient(db: Db, actor: OperationalClinicActor, patientId: string) {
    const patient = await db.patient.findFirst({
      where: { id: patientId, clinicId: actor.clinicId, deletedAt: null },
      select: { id: true, identityStatus: true, mergedIntoPatientId: true },
    });
    if (!patient) throw new NotFoundException('Patient introuvable dans votre établissement.');
    if (patient.identityStatus === 'MERGED') {
      throw new ForbiddenException('Ce dossier provisoire a été fusionné : utilisez le dossier patient définitif.');
    }
    return patient;
  }
}
