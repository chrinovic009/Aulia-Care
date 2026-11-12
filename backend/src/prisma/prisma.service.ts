import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { EventEmitter } from 'events';
import { RequestContext, currentRequestContext } from '../core/request-context';

const WRITE_ACTIONS = new Set(['create', 'createMany', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany']);

type TransactionFn = (arg: unknown, options?: unknown) => Promise<unknown>;
type Delegate = Record<string, (args: unknown) => Promise<unknown>>;

/** Transaction-local settings read by database triggers (audit) and policies. */
export function requestContextStatement(client: Pick<Prisma.TransactionClient, '$executeRaw'>, context: RequestContext) {
  return client.$executeRaw`SELECT
    set_config('app.user_id', ${context.userId}, true),
    set_config('app.user_role', ${context.role ?? ''}, true),
    set_config('app.clinic_id', ${context.clinicId ?? ''}, true),
    set_config('app.route', ${context.route ?? ''}, true)`;
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  static readonly realtimeEvents = new EventEmitter();

  constructor() {
    super();
    // Every transaction opened during an API request starts by declaring who acts.
    const original = this.$transaction.bind(this) as unknown as TransactionFn;
    const contextual: TransactionFn = (arg, options) => {
      const context = currentRequestContext();
      if (!context) return original(arg, options);
      if (typeof arg === 'function') {
        return original(async (tx: Prisma.TransactionClient) => {
          await requestContextStatement(tx, context);
          return (arg as (tx: Prisma.TransactionClient) => unknown)(tx);
        }, options);
      }
      if (Array.isArray(arg)) {
        return (original([requestContextStatement(this, context), ...arg], options) as Promise<unknown[]>)
          .then((results) => results.slice(1));
      }
      return original(arg, options);
    };
    (this as unknown as { $transaction: TransactionFn }).$transaction = contextual;
  }

  async onModuleInit() {
    await this.$connect();

    // A write issued outside a transaction during a request is replayed inside a
    // transaction so that the database knows its author. Registered first, so the
    // middlewares below only see the replayed query.
    this.$use(async (params, next) => {
      const context = currentRequestContext();
      if (context && params.model && !params.runInTransaction && WRITE_ACTIONS.has(params.action)) {
        const delegateName = params.model.charAt(0).toLowerCase() + params.model.slice(1);
        return this.$transaction(async (tx) => {
          const delegate = (tx as unknown as Record<string, Delegate>)[delegateName];
          return delegate[params.action](params.args);
        });
      }
      return next(params);
    });

    this.$use(async (params, next) => {
      const result = await next(params);
      const recordId = typeof (result as { id?: unknown } | null)?.id === 'string'
        ? (result as { id: string }).id
        : typeof (params.args as { where?: { id?: unknown } } | undefined)?.where?.id === 'string'
          ? String((params.args as { where: { id: string } }).where.id)
          : null;
      if (params.model && recordId && ['create', 'update', 'upsert', 'delete'].includes(params.action)) {
        PrismaService.realtimeEvents.emit('db.changed', {
          model: params.model,
          action: params.action,
          recordId,
          at: new Date().toISOString(),
        });
      }
      return result;
    });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
