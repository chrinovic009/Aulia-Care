import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RoleSlug } from '@prisma/client';

import { canReadUnitExamReconciliation } from './unit-exam-reconciliation.service';

test('le rapprochement des examens d’unité est réservé à la finance et à l’administration, pas à la caisse', () => {
  assert.equal(canReadUnitExamReconciliation(RoleSlug.FINANCE), true);
  assert.equal(canReadUnitExamReconciliation(RoleSlug.ADMIN), true);
  assert.equal(canReadUnitExamReconciliation(RoleSlug.CASHIER), false);
  assert.equal(canReadUnitExamReconciliation(RoleSlug.PHYSICIAN), false);
});
