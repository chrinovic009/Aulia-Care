import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveIsolatedE2eDatabaseTarget } from './e2e-database';

const isolatedEnvironment = {
  TEST_DATABASE_URL: 'postgresql://aulia_e2e_runner:password@127.0.0.1:55436/aulia_e2e_core?schema=public',
  AULIA_E2E_DATABASE_NAME: 'aulia_e2e_core',
  AULIA_E2E_DATABASE_USER: 'aulia_e2e_runner',
  AULIA_E2E_DATABASE_SENTINEL: 'e2e-sentinel-for-unit-tests',
  AULIA_E2E_TEST_CONFIRM: 'ISOLATED_POSTGRES_ONLY',
} as NodeJS.ProcessEnv;

test('E2E PostgreSQL requires an explicit isolated target', () => {
  assert.deepEqual(resolveIsolatedE2eDatabaseTarget(isolatedEnvironment), {
    databaseName: 'aulia_e2e_core',
    databaseUser: 'aulia_e2e_runner',
    sentinel: 'e2e-sentinel-for-unit-tests',
  });
  assert.throws(() => resolveIsolatedE2eDatabaseTarget({ ...isolatedEnvironment, AULIA_E2E_TEST_CONFIRM: undefined }), /TEST_CONFIRM/);
  assert.throws(() => resolveIsolatedE2eDatabaseTarget({ ...isolatedEnvironment, AULIA_E2E_DATABASE_NAME: 'aulia_care' }), /reserved aulia_e2e_/);
  assert.throws(() => resolveIsolatedE2eDatabaseTarget({
    ...isolatedEnvironment,
    TEST_DATABASE_URL: 'postgresql://aulia_e2e_runner:password@127.0.0.1:55436/aulia_e2e_other',
  }), /exactly match/);
});
