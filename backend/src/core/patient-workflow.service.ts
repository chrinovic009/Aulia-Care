import { BadRequestException, Injectable } from '@nestjs/common';
import {
  PatientWorkflowStatus,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

type WorkflowClient =
  | PrismaService
  | Prisma.TransactionClient;

/**
 * Patient workflow is a coarse-grained queue indicator, not the source of
 * truth for a consultation, prescription or examination.  Every route below
 * is an intentional operational hand-off.  A new visit is created by the
 * admission workflow; it must not silently reopen a completed visit here.
 */
const ALLOWED_TRANSITIONS: ReadonlyMap<
  PatientWorkflowStatus,
  ReadonlySet<PatientWorkflowStatus>
> = new Map([
  [PatientWorkflowStatus.EN_ATTENTE_DE_PAIEMENT, new Set([
    PatientWorkflowStatus.EN_ATTENTE_VALIDATION_CAISSE,
    PatientWorkflowStatus.EN_ATTENTE_INFIRMERIE,
    // Payment can release an already ordered laboratory, imaging or pharmacy
    // service. The related request/prescription remains the detailed source
    // of truth for the work still outstanding.
    PatientWorkflowStatus.EN_LABORATOIRE,
    PatientWorkflowStatus.EN_RADIOLOGIE,
    PatientWorkflowStatus.EN_PHARMACIE,
    // A physician can admit an unstable patient before administrative payment
    // is resolved. The hospitalization record remains the clinical source of
    // truth and the invoice stays outstanding.
    PatientWorkflowStatus.HOSPITALISE,
    PatientWorkflowStatus.ANNULE,
  ])],
  [PatientWorkflowStatus.EN_ATTENTE_VALIDATION_CAISSE, new Set([
    PatientWorkflowStatus.EN_ATTENTE_INFIRMERIE,
    PatientWorkflowStatus.EN_ATTENTE_DE_PAIEMENT,
    PatientWorkflowStatus.ANNULE,
  ])],
  [PatientWorkflowStatus.EN_ATTENTE_INFIRMERIE, new Set([
    PatientWorkflowStatus.EN_ATTENTE_MEDECIN,
    PatientWorkflowStatus.HOSPITALISE,
    PatientWorkflowStatus.ANNULE,
  ])],
  [PatientWorkflowStatus.EN_ATTENTE_MEDECIN, new Set([
    PatientWorkflowStatus.EN_CONSULTATION,
    // A consultation can create a directly scheduled service appointment.
    PatientWorkflowStatus.EN_LABORATOIRE,
    PatientWorkflowStatus.EN_RADIOLOGIE,
    PatientWorkflowStatus.EN_PHARMACIE,
    PatientWorkflowStatus.HOSPITALISE,
    PatientWorkflowStatus.ANNULE,
  ])],
  [PatientWorkflowStatus.EN_CONSULTATION, new Set([
    PatientWorkflowStatus.EN_ATTENTE_DE_PAIEMENT,
    PatientWorkflowStatus.EN_LABORATOIRE,
    PatientWorkflowStatus.EN_RADIOLOGIE,
    PatientWorkflowStatus.EN_PHARMACIE,
    PatientWorkflowStatus.HOSPITALISE,
    PatientWorkflowStatus.TERMINE,
    PatientWorkflowStatus.ANNULE,
  ])],
  [PatientWorkflowStatus.EN_LABORATOIRE, new Set([
    PatientWorkflowStatus.EN_CONSULTATION,
    PatientWorkflowStatus.EN_ATTENTE_DE_PAIEMENT,
    PatientWorkflowStatus.HOSPITALISE,
    PatientWorkflowStatus.ANNULE,
  ])],
  [PatientWorkflowStatus.EN_RADIOLOGIE, new Set([
    PatientWorkflowStatus.EN_CONSULTATION,
    PatientWorkflowStatus.EN_ATTENTE_DE_PAIEMENT,
    PatientWorkflowStatus.HOSPITALISE,
    PatientWorkflowStatus.ANNULE,
  ])],
  [PatientWorkflowStatus.EN_PHARMACIE, new Set([
    PatientWorkflowStatus.EN_CONSULTATION,
    PatientWorkflowStatus.TERMINE,
    PatientWorkflowStatus.HOSPITALISE,
    PatientWorkflowStatus.ANNULE,
  ])],
  [PatientWorkflowStatus.HOSPITALISE, new Set([
    PatientWorkflowStatus.TERMINE,
    PatientWorkflowStatus.EN_CONSULTATION,
    PatientWorkflowStatus.ANNULE,
  ])],
  [PatientWorkflowStatus.TERMINE, new Set()],
  [PatientWorkflowStatus.ANNULE, new Set()],
]);

@Injectable()
export class PatientWorkflowService {
  private protectedTransition(
    current: PatientWorkflowStatus,
    requested: PatientWorkflowStatus,
  ): PatientWorkflowStatus {
    if (current === requested) return current;
    if (ALLOWED_TRANSITIONS.get(current)?.has(requested)) return requested;
    throw new BadRequestException(
      `Transition patient interdite: ${current} -> ${requested}. Créez une nouvelle visite pour reprendre un dossier terminé.`,
    );
  }

  async transition(
    tx: WorkflowClient,
    patientId: string,
    requested: PatientWorkflowStatus,
    clinicId: string,
  ): Promise<PatientWorkflowStatus | null> {
    if (!clinicId?.trim()) {
      throw new Error(
        'Patient workflow transition requires an explicit clinicId.',
      );
    }

    await tx.$executeRaw(
      Prisma.sql`
        SELECT pg_advisory_xact_lock(
          hashtext(${`patient-workflow:${clinicId}:${patientId}`})
        )
      `,
    );

    const patient =
      await tx.patient.findFirst({
        where: {
          id: patientId,
          clinicId,
          deletedAt: null,
        },
        select: {
          workflowStatus: true,
        },
      });

    if (!patient) {
      return null;
    }

    const next =
      this.protectedTransition(
        patient.workflowStatus,
        requested,
      );

    if (next === patient.workflowStatus) {
      return next;
    }

    const update =
      await tx.patient.updateMany({
        where: {
          id: patientId,
          clinicId,
          deletedAt: null,
          workflowStatus:
            patient.workflowStatus,
        },
        data: {
          workflowStatus: next,
        },
      });

    if (update.count !== 1) {
      return null;
    }

    return next;
  }

  /**
   * A certified death is a documented clinical closure, not an operational
   * queue hand-off. It is deliberately separate from the ordinary transition
   * table so no caller can use it as a generic shortcut to reopen or reroute
   * a patient. The death-record service creates the audit history in the same
   * transaction immediately after this closure.
   */
  async completeForCertifiedDeath(
    tx: WorkflowClient,
    patientId: string,
    clinicId: string,
  ): Promise<PatientWorkflowStatus | null> {
    if (!clinicId?.trim()) {
      throw new Error('Patient workflow transition requires an explicit clinicId.');
    }

    await tx.$executeRaw(
      Prisma.sql`
        SELECT pg_advisory_xact_lock(
          hashtext(${`patient-workflow:${clinicId}:${patientId}`})
        )
      `,
    );

    const patient = await tx.patient.findFirst({
      where: { id: patientId, clinicId, deletedAt: null },
      select: { workflowStatus: true },
    });
    if (!patient) return null;
    if (patient.workflowStatus === PatientWorkflowStatus.TERMINE) {
      return PatientWorkflowStatus.TERMINE;
    }

    const update = await tx.patient.updateMany({
      where: {
        id: patientId,
        clinicId,
        deletedAt: null,
        workflowStatus: patient.workflowStatus,
      },
      data: { workflowStatus: PatientWorkflowStatus.TERMINE },
    });
    return update.count === 1 ? PatientWorkflowStatus.TERMINE : null;
  }
}
