import assert from 'node:assert/strict';
import test from 'node:test';
import { PatientWorkflowStatus } from '@prisma/client';

import { fakeTransaction } from './testing/fake-transaction';
import { PatientWorkflowConflictError, PatientWorkflowService } from './patient-workflow.service';

const fakeClient = (workflowStatus: PatientWorkflowStatus | null, count = 1) => {
  const calls = { updates: 0, audits: [] as string[] };
  return {
    calls,
    tx: {
      ...fakeTransaction(),
      auditLog: { create: async (input: { data: { summary: string } }) => { calls.audits.push(input.data.summary); return input.data; } },
      patient: {
        findFirst: async () => (workflowStatus ? { workflowStatus } : null),
        updateMany: async () => { calls.updates += 1; return { count }; },
      },
    } as any,
  };
};

test('a refused transition is reported as blocked, not as success', async () => {
  const { tx, calls } = fakeClient(PatientWorkflowStatus.HOSPITALISE);
  const result = await new PatientWorkflowService().transitionDetailed(tx, 'p', PatientWorkflowStatus.EN_ATTENTE_MEDECIN, 'c');
  assert.deepEqual(result, { outcome: 'blocked', status: PatientWorkflowStatus.HOSPITALISE, requested: PatientWorkflowStatus.EN_ATTENTE_MEDECIN });
  assert.equal(calls.updates, 0);
  assert.deepEqual(calls.audits, ['Changement de statut refusé : HOSPITALISE -> EN_ATTENTE_MEDECIN']);
});

test('an unknown patient is reported as not_found', async () => {
  const { tx } = fakeClient(null);
  assert.deepEqual(await new PatientWorkflowService().transitionDetailed(tx, 'p', PatientWorkflowStatus.TERMINE, 'c'), { outcome: 'not_found' });
});

test('a concurrent change despite the lock raises an error instead of returning null', async () => {
  const { tx } = fakeClient(PatientWorkflowStatus.EN_ATTENTE_MEDECIN, 0);
  await assert.rejects(
    () => new PatientWorkflowService().projectStatus(tx, 'p', PatientWorkflowStatus.EN_CONSULTATION, 'c'),
    PatientWorkflowConflictError,
  );
});


test('strict transitions reject while a payment projection preserves hospitalized state', async () => {
  const { tx } = fakeClient(PatientWorkflowStatus.HOSPITALISE);
  const core = new PatientWorkflowService();
  assert.equal(await core.projectStatus(tx, 'p', PatientWorkflowStatus.EN_ATTENTE_DE_PAIEMENT, 'c'), 'HOSPITALISE');
  await assert.rejects(() => core.requireTransition(tx, 'p', PatientWorkflowStatus.EN_ATTENTE_DE_PAIEMENT, 'c'), /refusé/);
});

test('un client hors transaction est refusé, quelle que soit sa classe Prisma', async () => {
  const tx = { ...fakeTransaction({ inTransaction: false }), patient: { findFirst: async () => ({ workflowStatus: PatientWorkflowStatus.EN_ATTENTE_MEDECIN }) } } as never;
  await assert.rejects(() => new PatientWorkflowService().transitionDetailed(tx, 'p', PatientWorkflowStatus.EN_CONSULTATION, 'c'), /active transaction client/);
});

test('une étape appliquée par le système, sans utilisateur connecté, est quand même journalisée (auteur SYSTEM)', async () => {
  const events: Array<{ data: { authorId: string | null; authorRole: string } }> = [];
  const tx = {
    ...fakeTransaction({ events }),
    patient: { findFirst: async () => ({ workflowStatus: PatientWorkflowStatus.EN_ATTENTE_MEDECIN }), updateMany: async () => ({ count: 1 }) },
  } as never;
  const result = await new PatientWorkflowService().transitionDetailed(tx, 'p', PatientWorkflowStatus.EN_CONSULTATION, 'c');
  assert.equal(result.outcome, 'applied');
  assert.equal(events.length, 1);
  assert.equal(events[0]?.data.authorId, null);
  assert.equal(events[0]?.data.authorRole, 'SYSTEM');
});
