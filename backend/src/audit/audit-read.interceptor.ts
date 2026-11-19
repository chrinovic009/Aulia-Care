import { CallHandler, ExecutionContext, Injectable, NestInterceptor, InternalServerErrorException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, from, mergeMap } from 'rxjs';
import { currentRequestContext } from '../core/request-context';
import { AUDIT_READ_KEY, AuditReadTarget } from './audit-read.decorator';
import { AuditLedgerService } from './audit-ledger.service';

/**
 * Fail-closed record-read audit: if the READ cannot be written to the ledger,
 * the record is not returned.
 */
@Injectable()
export class AuditReadInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly ledger: AuditLedgerService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const target = this.reflector.get<AuditReadTarget | undefined>(AUDIT_READ_KEY, context.getHandler());
    if (!target) return next.handle();
    const params = context.switchToHttp().getRequest<{ params?: Record<string, string> }>().params ?? {};
    return next.handle().pipe(
      mergeMap((body) => {
        const requestContext = currentRequestContext();
        const entityId = params[target.param];
        if (!requestContext || !entityId) {
          throw new InternalServerErrorException("Contexte d’audit manquant : lecture refusée.");
        }
        return from(this.ledger.recordRead(requestContext, target.entity, entityId).then(() => body));
      }),
    );
  }
}
