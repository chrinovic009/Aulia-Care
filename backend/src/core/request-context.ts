import { AsyncLocalStorage } from 'async_hooks';
import type { Prisma } from '@prisma/client';

/**
 * Who is acting, for the duration of one API request. It is propagated to
 * PostgreSQL at the start of every transaction (app.user_id, app.user_role,
 * app.clinic_id, app.route) so that database triggers can attribute changes.
 */
export interface RequestContext {
  userId: string;
  clinicId?: string | null;
  role?: string | null;
  roles?: readonly string[];
  route?: string | null;
  rejectedWorkflowWrites?: Prisma.AuditLogUncheckedCreateInput[];
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(context: RequestContext, work: () => T): T {
  return storage.run(context, work);
}

export function currentRequestContext(): RequestContext | undefined {
  return storage.getStore();
}
