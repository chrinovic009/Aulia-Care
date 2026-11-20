import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { EventEmitter } from 'events';
import { RequestContext, currentRequestContext } from '../core/request-context';

type TransactionFn = (arg: unknown, options?: unknown) => Promise<unknown>;
export const REQUEST_DATABASE_ROLE = 'aulia_app';

export function requestContextStatement(client: Pick<Prisma.TransactionClient, '$executeRaw'>, context: RequestContext) {
  return client.$executeRaw`SELECT
    set_config('app.user_id', ${context.userId}, true),
    set_config('app.user_role', ${context.role ?? ''}, true),
    set_config('app.user_roles', ${JSON.stringify(context.roles ?? [])}, true),
    set_config('app.clinic_id', ${context.clinicId ?? ''}, true),
    set_config('app.patient_id', ${context.patientId ?? ''}, true),
    set_config('app.patient_clinic_id', ${context.patientClinicId ?? ''}, true),
    set_config('app.route', ${context.route ?? ''}, true),
    set_config('role', ${REQUEST_DATABASE_ROLE}, true)`;
}

/** Pinned Prisma 5.22 adapter: never detach a query from its existing transaction. */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  static readonly realtimeEvents = new EventEmitter();

  constructor() {
    super();
    if (Prisma.prismaVersion.client !== '5.22.0') {
      throw new Error('Prisma transaction adapter requires 5.22.0; run transaction regression tests before upgrading.');
    }
    const contextSetup = requestContextStatement.bind(null, this);
    const original = this.$transaction.bind(this) as unknown as TransactionFn;
    const extended = this.$extends({
      query: {
        async $allOperations(input) {
          // Prisma 5.22 passes this descriptor but does not expose it in the public type.
          // Fail closed if it disappears; an ALS flag cannot identify a query transaction.
          const internal = (input as unknown as { __internalParams?: { transaction?: unknown } }).__internalParams;
          if (!internal || !('transaction' in internal)) {
            throw new Error('Prisma transaction metadata unavailable; refusing an unscoped query.');
          }
          const { model, operation, args, query } = input;
          const context = currentRequestContext();
          let result: unknown;
          if (context && !internal.transaction) {
            const values = await original([contextSetup(context), query(args)]);
            result = (values as unknown[])[1];
          } else {
            result = await query(args);
          }
          const recordId = typeof (result as { id?: unknown } | null)?.id === 'string'
            ? (result as { id: string }).id
            : typeof (args as { where?: { id?: unknown } } | undefined)?.where?.id === 'string'
              ? String((args as { where: { id: string } }).where.id) : null;
          if (model && recordId && ['create', 'update', 'upsert', 'delete'].includes(operation)) {
            PrismaService.realtimeEvents.emit('db.changed', { model, action: operation, recordId, at: new Date().toISOString() });
          }
          return result;
        },
      },
    });
    const contextual: TransactionFn = (arg, options) => {
      const context = currentRequestContext();
      if (!context) return original(arg, options);
      if (typeof arg === 'function') {
        // Bind the extended client so callback queries retain both the extension and tx descriptor.
        return (extended.$transaction.bind(extended) as unknown as TransactionFn)(async (tx: Prisma.TransactionClient) => {
          // Calling setup on tx already carries a transaction descriptor: no recursive wrapper.
          await requestContextStatement(tx, context);
          return (arg as (tx: Prisma.TransactionClient) => unknown)(tx);
        }, options);
      }
      if (Array.isArray(arg)) {
        return (original([contextSetup(context), ...arg], options) as Promise<unknown[]>).then(results => results.slice(1));
      }
      return original(arg, options);
    };
    // Prisma extensions return a client proxy, not a mutated base instance.
    // Preserve Nest lifecycle methods through this facade without replacing lazy PrismaPromises.
    return new Proxy(this, {
      get(target, key) {
        if (key === '$transaction') return contextual;
        if (key === 'onModuleInit' || key === 'onModuleDestroy') return Reflect.get(target, key).bind(target);
        const value = Reflect.get(extended, key);
        return typeof value === 'function' ? value.bind(extended) : value;
      },
    });
  }

  async onModuleInit() { await this.$connect(); }
  async onModuleDestroy() { await this.$disconnect(); }
}
