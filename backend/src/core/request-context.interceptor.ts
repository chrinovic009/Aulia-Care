import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor, OnApplicationBootstrap } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Observable, concatMap, dematerialize, materialize } from 'rxjs';
import { RequestContext, runWithRequestContext } from './request-context';
import { PrismaService } from '../prisma/prisma.service';
import { replaySpooledAudits, spoolAuditRecords, type SpooledAudit } from './audit-spool';

type AuthedRequest = {
  method?: string;
  path?: string;
  route?: { path?: string };
  user?: { userId?: string; patientId?: string | null; patientClinicId?: string | null; clinicId?: string | null; role?: string | null; roles?: string[] };
};

/** Runs every authenticated request handler inside its request context (after guards). */
@Injectable()
export class RequestContextInterceptor implements NestInterceptor, OnApplicationBootstrap {
  private readonly logger = new Logger(RequestContextInterceptor.name);
  constructor(private readonly prisma: PrismaService) {}

  /** Audit refusals spooled during a database outage are written back at start-up. */
  async onApplicationBootstrap() {
    await this.replaySpool();
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const user = request.user;
    if (!user?.userId) return next.handle();
    const requestContext: RequestContext = {
      userId: user.userId,
      patientId: user.patientId ?? null,
      patientClinicId: user.patientClinicId ?? null,
      clinicId: user.clinicId ?? null,
      role: user.role ?? null,
      roles: user.roles ?? [],
      rejectedWorkflowWrites: [],
      route: `${request.method ?? ''} ${request.route?.path ?? request.path ?? ''}`.trim(),
    };
    return new Observable((subscriber) =>
      runWithRequestContext(requestContext, () => next.handle().pipe(
        materialize(),
        concatMap(async notification => {
          // A strict transition rolls back its transaction, including the first audit.
          // Persist the refusal after rollback, and await it before returning the error.
          if (notification.kind === 'E' && requestContext.rejectedWorkflowWrites?.length) {
            await this.persistRejectedWorkflowWrites(requestContext.rejectedWorkflowWrites);
          }
          return notification;
        }),
        dematerialize(),
      ).subscribe(subscriber)));
  }

  private async writeAudits(records: SpooledAudit[]) {
    await this.prisma.auditLog.createMany({ data: records, skipDuplicates: true });
  }

  async persistRejectedWorkflowWrites(writes: NonNullable<RequestContext['rejectedWorkflowWrites']>) {
    // Stable ids: a record written then also spooled (or replayed twice) is stored once.
    const records: SpooledAudit[] = writes.map((data) => ({ ...data, id: data.id ?? randomUUID() }));
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await this.writeAudits(records);
        await this.replaySpool();
        return;
      } catch (error) {
        lastError = error;
        if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 50 * (attempt + 1)));
      }
    }
    // Database still unavailable: keep the refusal on the clinic server instead of losing it.
    try {
      spoolAuditRecords(records);
      this.logger.error(`Rejected workflow audit spooled locally after retries: ${lastError instanceof Error ? lastError.name : 'unknown error'}`);
    } catch (spoolError) {
      // Never put patient or actor IDs in operational logs.
      this.logger.error(`AUDIT LOST: database and local spool both failed (${lastError instanceof Error ? lastError.name : 'unknown'} / ${spoolError instanceof Error ? spoolError.name : 'unknown'})`);
    }
  }

  private async replaySpool() {
    try {
      const replayed = await replaySpooledAudits((records) => this.writeAudits(records));
      if (replayed) this.logger.log(`Replayed ${replayed} spooled audit record(s).`);
    } catch (error) {
      this.logger.warn(`Spooled audit replay postponed: ${error instanceof Error ? error.name : 'unknown error'}`);
    }
  }
}
