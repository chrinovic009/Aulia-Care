import { Injectable } from '@nestjs/common';
import {
  PatientWorkflowStatus,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

type WorkflowClient =
  | PrismaService
  | Prisma.TransactionClient;

const REGRESSIVE_STATUSES =
  new Set<PatientWorkflowStatus>([
    PatientWorkflowStatus.EN_ATTENTE_DE_PAIEMENT,
    PatientWorkflowStatus.EN_ATTENTE_VALIDATION_CAISSE,
    PatientWorkflowStatus.EN_ATTENTE_INFIRMERIE,
    PatientWorkflowStatus.EN_ATTENTE_MEDECIN,
  ]);

const PRIORITY_STATUSES =
  new Set<PatientWorkflowStatus>([
    PatientWorkflowStatus.HOSPITALISE,
    PatientWorkflowStatus.EN_CONSULTATION,
    PatientWorkflowStatus.EN_LABORATOIRE,
    PatientWorkflowStatus.EN_RADIOLOGIE,
    PatientWorkflowStatus.EN_PHARMACIE,
  ]);

@Injectable()
export class PatientWorkflowService {
  private protectedTransition(
    current: PatientWorkflowStatus,
    requested: PatientWorkflowStatus,
  ): PatientWorkflowStatus {
    if (
      current === PatientWorkflowStatus.HOSPITALISE &&
      REGRESSIVE_STATUSES.has(requested)
    ) {
      return PatientWorkflowStatus.HOSPITALISE;
    }

    if (
      current === PatientWorkflowStatus.EN_CONSULTATION &&
      REGRESSIVE_STATUSES.has(requested)
    ) {
      return PatientWorkflowStatus.EN_CONSULTATION;
    }

    if (
      current === PatientWorkflowStatus.HOSPITALISE &&
      requested === PatientWorkflowStatus.TERMINE
    ) {
      return PatientWorkflowStatus.TERMINE;
    }

    if (
      current === PatientWorkflowStatus.EN_CONSULTATION &&
      PRIORITY_STATUSES.has(requested)
    ) {
      return requested;
    }

    if (
      current === PatientWorkflowStatus.TERMINE &&
      requested !== PatientWorkflowStatus.TERMINE
    ) {
      return requested;
    }

    return requested;
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
}