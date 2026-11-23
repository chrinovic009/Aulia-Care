import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { EventEmitter } from 'events';
import { RequestContext, currentRequestContext, runWithRequestContext } from '../core/request-context';

type TransactionFn = (arg: unknown, options?: unknown) => Promise<unknown>;
export const REQUEST_DATABASE_ROLE = 'aulia_app';
/** Application-facing facade of each client, kept outside the instance: Prisma's client is itself a proxy. */
const FACADES = new WeakMap<object, PrismaService>();

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
    const facade = new Proxy(this, {
      get(target, key) {
        if (key === '$transaction') return contextual;
        if (key === 'onModuleInit' || key === 'onModuleDestroy') return Reflect.get(target, key).bind(target);
        const value = Reflect.get(extended, key);
        return typeof value === 'function' ? value.bind(extended) : value;
      },
    });
    FACADES.set(this, facade);
    return facade;
  }

  async onModuleInit() {
    await this.$connect();
    await this.assertRequestScoping();
  }

  /**
   * Start-up self-test of the tenant adapter. It relies on a Prisma 5.22
   * internal detail, so instead of trusting it we prove, against the real
   * database, that a query made during a request runs as the restricted role
   * with the request's identity — for a single query, an array transaction and
   * an interactive transaction. The API refuses to start otherwise, so an
   * upgrade that silently breaks isolation can never reach production.
   */
  async assertRequestScoping() {
    const client = FACADES.get(this) ?? this;
    const probe: RequestContext = { userId: '00000000-0000-4000-8000-00000000c0de', role: 'SCOPE_SELFTEST', roles: [], clinicId: null, route: 'startup.self-test' };
    type Row = { db_role: string; user_id: string };
    const check = (rows: Row[] | undefined, kind: string) => {
      const row = rows?.[0];
      if (row?.db_role !== REQUEST_DATABASE_ROLE || row?.user_id !== probe.userId) {
        throw new Error(`Isolation des établissements inactive (${kind}) : rôle=${row?.db_role ?? '?'}. Démarrage refusé — vérifier l'adaptateur Prisma avant toute mise à jour.`);
      }
    };
    await runWithRequestContext(probe, async () => {
      check(await client.$queryRaw<Row[]>`SELECT current_user::text AS db_role, current_setting('app.user_id', true) AS user_id`, 'requête simple');
      const [batched] = await client.$transaction([client.$queryRaw<Row[]>`SELECT current_user::text AS db_role, current_setting('app.user_id', true) AS user_id`]);
      check(batched, 'transaction groupée');
      const interactive = await client.$transaction((tx) => tx.$queryRaw<Row[]>`SELECT current_user::text AS db_role, current_setting('app.user_id', true) AS user_id`);
      check(interactive, 'transaction interactive');
    });
    const outside = await client.$queryRaw<Row[]>`SELECT current_user::text AS db_role, current_setting('app.user_id', true) AS user_id`;
    if (outside?.[0]?.db_role === REQUEST_DATABASE_ROLE) throw new Error('Le rôle restreint a fui hors d’une requête authentifiée.');
  }
  async onModuleDestroy() { await this.$disconnect(); }
}
