import { Injectable, Logger, ConflictException, NotFoundException } from '@nestjs/common';
import { PatientWorkflowStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { currentRequestContext } from './request-context';
import { decideWorkflowTransition } from './patient-workflow.policy';

type WorkflowTransaction = Prisma.TransactionClient;

export type WorkflowTransitionResult =
  | { outcome: 'not_found' }
  | { outcome: 'unchanged'; status: PatientWorkflowStatus }
  | { outcome: 'applied'; status: PatientWorkflowStatus; previous: PatientWorkflowStatus }
  | { outcome: 'blocked'; status: PatientWorkflowStatus; requested: PatientWorkflowStatus };

/** Raised when the row changed despite the advisory lock: a bug, never a normal case. */
export class PatientWorkflowConflictError extends Error {
  constructor() {
    super('Patient workflow changed concurrently despite the lock.');
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
    tx: WorkflowTransaction,
    patientId: string,
    requested: PatientWorkflowStatus,
    clinicId: string | null | undefined,
  ): Promise<WorkflowTransitionResult> {
    if (tx instanceof PrismaService) {
      throw new Error('Patient workflow transition requires an active transaction client.');
    }
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
        `Workflow transition refused: ${decision.status} -> ${requested}`,
      );
      const context = currentRequestContext();
      if (context?.clinicId && context.clinicId !== clinicId) throw new Error('Workflow audit clinic mismatch.');
      // Visible trace in the clinic audit log, not only in server logs.
      await tx.auditLog.create({
        data: {
          patientId,
          actorId: context?.userId,
          action: 'REJECT',
          entity: 'PatientWorkflow',
          entityId: patientId,
          summary: `Changement de statut refusé : ${decision.status} -> ${requested}`,
          metadata: { from: decision.status, requested, clinicId, actorRole: context?.role ?? null, actorRoles: context?.roles ?? [], route: context?.route ?? null },
        },
      });
      return decision;
    }
    if (decision.outcome === 'unchanged') return decision;

    await tx.$executeRaw(Prisma.sql`SELECT set_config('app.workflow_patient', ${patientId}, true)`);
    const update = await tx.patient.updateMany({
      where: { id: patientId, clinicId, deletedAt: null, workflowStatus: patient.workflowStatus },
      data: { workflowStatus: decision.status },
    });
    await tx.$executeRaw(Prisma.sql`SELECT set_config('app.workflow_patient', '', true)`);
    if (update.count !== 1) throw new PatientWorkflowConflictError();

    return decision;
  }

  /** Required workflow changes abort their containing operation on refusal. */
  async requireTransition(tx: WorkflowTransaction, patientId: string, requested: PatientWorkflowStatus, clinicId: string | null | undefined) {
    const result = await this.transitionDetailed(tx, patientId, requested, clinicId);
    if (result.outcome === 'not_found') throw new NotFoundException('Patient introuvable dans cet établissement.');
    if (result.outcome === 'blocked') {
      const context = currentRequestContext();
      context?.rejectedWorkflowWrites?.push({
        patientId, actorId: context.userId, action: 'REJECT', entity: 'PatientWorkflow', entityId: patientId,
        summary: `Changement de statut refusé : ${result.status} -> ${requested}`,
        metadata: { from: result.status, requested, clinicId, actorRole: context.role ?? null, actorRoles: [...(context.roles ?? [])], route: context.route ?? null },
      });
      throw new ConflictException('Changement de parcours refusé.');
    }
    return result.status;
  }

  /** Best-effort queue projection: payment/order success is not a workflow success. */
  async projectStatus(tx: WorkflowTransaction, patientId: string, requested: PatientWorkflowStatus, clinicId: string | null | undefined) {
    const result = await this.transitionDetailed(tx, patientId, requested, clinicId);
    if (result.outcome === 'not_found') throw new NotFoundException('Patient introuvable dans cet établissement.');
    return result.status;
  }
}
