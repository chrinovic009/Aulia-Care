import assert from 'node:assert/strict';
import test from 'node:test';
import type { ExecutionContext } from '@nestjs/common';
import { RolesGuard } from './roles.guard';

const contextFor = (path: string, role: string): ExecutionContext => ({
  getHandler: () => ({}),
  getClass: () => ({}),
  switchToHttp: () => ({ getRequest: () => ({ path, user: { role } }) }),
} as unknown as ExecutionContext);

test('SUPER_ADMIN cannot obtain direct clinical access merely because a controller lists the role', () => {
  const reflector = { getAllAndOverride: () => ['SUPER_ADMIN', 'PHYSICIAN'] };
  const guard = new RolesGuard(reflector as never);
  assert.throws(() => guard.canActivate(contextFor('/api/patients/patient-a', 'SUPER_ADMIN')));
  assert.equal(guard.canActivate(contextFor('/api/billing/invoices', 'SUPER_ADMIN')), true);
});
