import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertDemoDatabaseTarget,
  getAuliaAppMode,
  isDemoMode,
  isOptionalProductEnabled,
  resolveDemoDatabaseTarget,
} from './app-mode';

const demoEnvironment = {
  AULIA_APP_MODE: 'demo',
  DATABASE_URL: 'postgresql://demo_runner:password@127.0.0.1:55435/aulia_core_demo_test?schema=public',
  AULIA_DEMO_DATABASE_NAME: 'aulia_core_demo_test',
  AULIA_DEMO_DATABASE_USER: 'demo_runner',
  AULIA_DEMO_DATABASE_SENTINEL: 'demo-sentinel-for-unit-tests',
} as NodeJS.ProcessEnv;

test('demo mode is explicit and disables optional products', () => {
  const environment = {
    ...demoEnvironment,
    AULIA_ENABLE_DIAGNOSTIC_AGENT: 'true',
    AULIA_ENABLE_CONNECTED_CARE: 'true',
  };
  assert.equal(getAuliaAppMode(environment), 'demo');
  assert.equal(isDemoMode(environment), true);
  assert.equal(isOptionalProductEnabled('AULIA_ENABLE_DIAGNOSTIC_AGENT', environment), false);
  assert.equal(isOptionalProductEnabled('AULIA_ENABLE_CONNECTED_CARE', environment), false);
});

test('standard mode retains explicit optional-product flags', () => {
  const enabled = { AULIA_APP_MODE: 'standard' } as NodeJS.ProcessEnv;
  const disabled = {
    AULIA_ENABLE_DIAGNOSTIC_AGENT: 'false',
    AULIA_ENABLE_CONNECTED_CARE: 'false',
  } as NodeJS.ProcessEnv;
  assert.equal(getAuliaAppMode(enabled), 'standard');
  assert.equal(isOptionalProductEnabled('AULIA_ENABLE_DIAGNOSTIC_AGENT', enabled), true);
  assert.equal(isOptionalProductEnabled('AULIA_ENABLE_DIAGNOSTIC_AGENT', disabled), false);
  assert.equal(isOptionalProductEnabled('AULIA_ENABLE_CONNECTED_CARE', disabled), false);
});

test('demo runtime requires an exact declared PostgreSQL database and user', () => {
  assert.deepEqual(resolveDemoDatabaseTarget(demoEnvironment), {
    databaseName: 'aulia_core_demo_test',
    databaseUser: 'demo_runner',
    sentinel: 'demo-sentinel-for-unit-tests',
  });
  assert.throws(
    () => resolveDemoDatabaseTarget({
      ...demoEnvironment,
      DATABASE_URL: 'postgresql://demo_runner:password@127.0.0.1:55435/aulia_core_demo_other',
    }),
    /correspondre exactement/,
  );
  assert.throws(
    () => assertDemoDatabaseTarget({
      ...demoEnvironment,
      AULIA_DEMO_DATABASE_SENTINEL: 'too-short',
    }),
    /au moins 24 caracteres/,
  );
});

test('demo runtime refuses remote PostgreSQL servers', () => {
  assert.throws(
    () => resolveDemoDatabaseTarget({
      ...demoEnvironment,
      DATABASE_URL:
        'postgresql://demo_runner:password@production.example.com:5432/aulia_core_demo_test',
    }),
    /127\.0\.0\.1:55435/,
  );
});