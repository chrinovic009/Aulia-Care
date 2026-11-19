import assert from 'node:assert/strict';
import test from 'node:test';
import { PatientWorkflowStatus } from '@prisma/client';

import { PatientWorkflowConflictError, PatientWorkflowService } from './patient-workflow.service';

const fakeClient = (workflowStatus: PatientWorkflowStatus | null, count = 1) => {
  const calls = { updates: 0, audits: [] as string[] };
  return {
    calls,
    tx: {
      $executeRaw: async () => undefined,
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
    () => new PatientWorkflowService().transition(tx, 'p', PatientWorkflowStatus.EN_CONSULTATION, 'c'),
    PatientWorkflowConflictError,
  );
});
