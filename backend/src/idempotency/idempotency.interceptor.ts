import { BadRequestException, CallHandler, ConflictException, ExecutionContext, Injectable, NestInterceptor, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Observable, from, mergeMap, catchError, throwError } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { IDEMPOTENCY_KEY_PATTERN, IDEMPOTENT_METHODS, StoredOutcome, outcomeFor, requestFingerprint } from './idempotency';

type Claim = { kind: 'execute'; id: string } | Exclude<StoredOutcome, { kind: 'execute' }>;

type HttpRequest = {
  method?: string;
  originalUrl?: string;
  path?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
  user?: { userId?: string };
};
type HttpResponse = { statusCode?: number; status: (code: number) => unknown; setHeader?: (name: string, value: string) => void };

/**
 * Exactly-once writes for authenticated requests that carry an Idempotency-Key
 * header: the first request runs and its result is stored; the same request
 * sent again (offline replay, retry after a timeout) gets the stored result
 * without running twice. Failed requests are not stored, so they can be retried.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const http = context.switchToHttp();
    const request = http.getRequest<HttpRequest>();
    const response = http.getResponse<HttpResponse>();
    const method = (request.method ?? 'GET').toUpperCase();
    const header = request.headers?.['idempotency-key'];
    const key = Array.isArray(header) ? header[0] : header;
    const userId = request.user?.userId;
    if (!key || !IDEMPOTENT_METHODS.has(method) || !userId) return next.handle();
    if (!IDEMPOTENCY_KEY_PATTERN.test(key)) throw new BadRequestException('En-tête Idempotency-Key invalide.');

    const route = (request.originalUrl ?? request.path ?? '').split('?')[0];
    const fingerprint = requestFingerprint(method, route, request.body ?? null);

    return from(this.claim(userId, key, method, route, fingerprint)).pipe(
      mergeMap((claim) => {
        if (claim.kind === 'replay') {
          response.status(claim.statusCode);
          response.setHeader?.('Idempotent-Replayed', 'true');
          return from([claim.response]);
        }
        if (claim.kind === 'mismatch') {
          throw new UnprocessableEntityException('Cette clé d’idempotence a déjà servi pour une autre requête.');
        }
        if (claim.kind === 'in-progress') {
          throw new ConflictException('La même saisie est déjà en cours de traitement. Réessayez dans un instant.');
        }
        return next.handle().pipe(
          mergeMap((body) => from(this.complete(claim.id, response.statusCode ?? 200, body).then(() => body))),
          catchError((error) => from(this.release(claim.id)).pipe(mergeMap(() => throwError(() => error)))),
        );
      }),
    );
  }

  /** Reserves the key, or reports what an earlier request with it became. */
  private async claim(userId: string, key: string, method: string, route: string, requestHash: string): Promise<Claim> {
    try {
      const created = await this.prisma.idempotencyRecord.create({ data: { userId, key, method, route, requestHash }, select: { id: true } });
      return { kind: 'execute' as const, id: created.id };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      const existing = await this.prisma.idempotencyRecord.findUnique({ where: { userId_key: { userId, key } } });
      const outcome = outcomeFor(existing, requestHash);
      if (outcome.kind === 'execute') return this.claim(userId, key, method, route, requestHash);
      return outcome;
    }
  }

  private complete(id: string, statusCode: number, body: unknown) {
    return this.prisma.idempotencyRecord.update({
      where: { id },
      data: { statusCode, response: (body ?? null) as Prisma.InputJsonValue, completedAt: new Date() },
    });
  }

  private release(id: string) {
    return this.prisma.idempotencyRecord.delete({ where: { id } }).catch(() => undefined);
  }
}
