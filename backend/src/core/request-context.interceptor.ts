import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable, concatMap, dematerialize, materialize } from 'rxjs';
import { RequestContext, runWithRequestContext } from './request-context';
import { PrismaService } from '../prisma/prisma.service';

type AuthedRequest = {
  method?: string;
  path?: string;
  route?: { path?: string };
  user?: { userId?: string; patientId?: string | null; patientClinicId?: string | null; clinicId?: string | null; role?: string | null; roles?: string[] };
};

/** Runs every authenticated request handler inside its request context (after guards). */
@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RequestContextInterceptor.name);
  constructor(private readonly prisma: PrismaService) {}
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

  private async persistRejectedWorkflowWrites(writes: NonNullable<RequestContext['rejectedWorkflowWrites']>) {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await this.prisma.$transaction(async tx => {
          for (const data of writes) await tx.auditLog.create({ data });
        });
        return;
      } catch (error) {
        lastError = error;
        if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 50 * (attempt + 1)));
      }
    }
    // Preserve the original domain error; never put patient or actor IDs in operational logs.
    this.logger.error(`Failed to persist rejected workflow audit after retries: ${lastError instanceof Error ? lastError.name : 'unknown error'}`);
  }
}
