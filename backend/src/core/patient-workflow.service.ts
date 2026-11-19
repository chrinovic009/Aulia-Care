import { Injectable, Logger } from '@nestjs/common';
import { PatientWorkflowStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { decideWorkflowTransition } from './patient-workflow.policy';

type WorkflowClient = PrismaService | Prisma.TransactionClient;

export type WorkflowTransitionResult =
  | { outcome: 'not_found' }
  | { outcome: 'unchanged'; status: PatientWorkflowStatus }
  | { outcome: 'applied'; status: PatientWorkflowStatus; previous: PatientWorkflowStatus }
  | { outcome: 'blocked'; status: PatientWorkflowStatus; requested: PatientWorkflowStatus };

/** Raised when the row changed despite the advisory lock: a bug, never a normal case. */
export class PatientWorkflowConflictError extends Error {
  constructor(patientId: string) {
    super(`Patient workflow changed concurrently despite the lock (patient ${patientId}).`);
    this.name = 'PatientWorkflowConflictError';
  }
}

@Injectable()
export class PatientWorkflowService {
  private readonly logger = new Logger(PatientWorkflowService.name);

  /**
   * Applies a requested status under a per-patient advisory lock and reports
   * exactly what happened. Callers must notify `result.status`, which is the
   * persisted status, never the requested one.
   */
  async transitionDetailed(
    tx: WorkflowClient,
    patientId: string,
    requested: PatientWorkflowStatus,
    clinicId: string | null | undefined,
  ): Promise<WorkflowTransitionResult> {
    if (!clinicId?.trim()) {
      throw new Error('Patient workflow transition requires an explicit clinicId.');
    }

    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`patient-workflow:${clinicId}:${patientId}`}))`,
    );

    const patient = await tx.patient.findFirst({
      where: { id: patientId, clinicId, deletedAt: null },
      select: { workflowStatus: true },
    });
    if (!patient) return { outcome: 'not_found' };

    const decision = decideWorkflowTransition(patient.workflowStatus, requested);
    if (decision.outcome === 'blocked') {
      this.logger.warn(
        `Workflow transition refused for patient ${patientId}: ${decision.status} -> ${requested}`,
      );
      return decision;
    }
    if (decision.outcome === 'unchanged') return decision;

    const update = await tx.patient.updateMany({
      where: { id: patientId, clinicId, deletedAt: null, workflowStatus: patient.workflowStatus },
      data: { workflowStatus: decision.status },
    });
    if (update.count !== 1) throw new PatientWorkflowConflictError(patientId);

    return decision;
  }

  /**
   * Compatibility wrapper: returns the persisted status, or null only when the
   * patient does not exist in this clinic.
   */
  async transition(
    tx: WorkflowClient,
    patientId: string,
    requested: PatientWorkflowStatus,
    clinicId: string | null | undefined,
  ): Promise<PatientWorkflowStatus | null> {
    const result = await this.transitionDetailed(tx, patientId, requested, clinicId);
    return result.outcome === 'not_found' ? null : result.status;
  }
}
