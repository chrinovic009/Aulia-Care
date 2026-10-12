import assert from 'node:assert/strict';
import test from 'node:test';
import { PatientWorkflowStatus, RoleSlug } from '@prisma/client';
import {
  DEMO_PATIENTS,
  DEMO_USERS,
  assertDemoSeedBusinessInventoryIsEmpty,
  validateDemoSeedEnvironment,
} from '../../prisma/seed-demo';

const demoEnvironment = {
  AULIA_APP_MODE: 'demo',
  AULIA_DEMO_SEED_CONFIRM: 'true',
  AULIA_DEMO_PASSWORD: 'DemoPasswordOnly-2026',
  DATABASE_URL: 'postgresql://demo_runner:password@localhost:55435/aulia_core_demo_test?schema=public',
  AULIA_DEMO_DATABASE_NAME: 'aulia_core_demo_test',
  AULIA_DEMO_DATABASE_USER: 'demo_runner',
  AULIA_DEMO_DATABASE_SENTINEL: 'demo-sentinel-for-unit-tests',
};

test('demo seed refuses an installation that is not explicitly demo', () => {
  assert.throws(
    () => validateDemoSeedEnvironment({ ...demoEnvironment, AULIA_APP_MODE: 'production' }),
    /AULIA_APP_MODE=demo/,
  );
  assert.throws(
    () => validateDemoSeedEnvironment({ ...demoEnvironment, AULIA_DEMO_SEED_CONFIRM: 'false' }),
    /AULIA_DEMO_SEED_CONFIRM=true/,
  );
  assert.throws(
    () => validateDemoSeedEnvironment({ ...demoEnvironment, AULIA_DEMO_PASSWORD: 'short' }),
    /at least 16/,
  );
});

test('demo seed refuses an ambiguous database declaration', () => {
  assert.throws(
    () => validateDemoSeedEnvironment({
      ...demoEnvironment,
      DATABASE_URL: 'postgresql://demo_runner:password@localhost:55435/aulia_core_demo_other',
    }),
    /(correspondre exactement|127\.0\.0\.1:55435)/,
  );
  assert.throws(
    () => validateDemoSeedEnvironment({
      ...demoEnvironment,
      AULIA_DEMO_DATABASE_SENTINEL: 'invalid',
    }),
    /au moins 24 caracteres/,
  );
});

test('first demo seed refuses any pre-existing business data', () => {
  const emptyInventory = {
    clinics: 0,
    users: 0,
    employees: 0,
    patients: 0,
    departments: 0,
    services: 0,
    serviceUnits: 0,
    appointments: 0,
    consultations: 0,
    labRequests: 0,
    prescriptions: 0,
    invoices: 0,
    payments: 0,
    hospitalizations: 0,
  };
  assert.doesNotThrow(() => assertDemoSeedBusinessInventoryIsEmpty(emptyInventory));
  assert.throws(
    () => assertDemoSeedBusinessInventoryIsEmpty({ ...emptyInventory, patients: 1 }),
    /pre-existing business data found in patients/,
  );
  assert.throws(
    () => assertDemoSeedBusinessInventoryIsEmpty({ ...emptyInventory, invoices: 2, employees: 1 }),
    /employees, invoices/,
  );
});

test('demo fixtures are deterministic, Core-only and never create DEV', () => {
  assert.equal(DEMO_USERS.length, 10);
  assert.equal(new Set(DEMO_USERS.map((user) => user.username)).size, 10);
  assert.equal(DEMO_USERS.some((user) => user.role === RoleSlug.DEV), false);
  assert.deepEqual(
    new Set(DEMO_PATIENTS.map((patient) => patient.workflowStatus)),
    new Set([
      PatientWorkflowStatus.EN_ATTENTE_DE_PAIEMENT,
      PatientWorkflowStatus.EN_ATTENTE_INFIRMERIE,
      PatientWorkflowStatus.EN_ATTENTE_MEDECIN,
      PatientWorkflowStatus.EN_CONSULTATION,
      PatientWorkflowStatus.EN_LABORATOIRE,
      PatientWorkflowStatus.EN_PHARMACIE,
      PatientWorkflowStatus.TERMINE,
    ]),
  );
});
