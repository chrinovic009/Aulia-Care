import assert from 'node:assert/strict';
import test from 'node:test';
import { PatientWorkflowStatus as S } from '@prisma/client';

import { ALLOWED_WORKFLOW_TRANSITIONS, decideWorkflowTransition } from './patient-workflow.policy';

test('every workflow status has an explicit transition list', () => {
  for (const status of Object.values(S)) {
    assert.ok(ALLOWED_WORKFLOW_TRANSITIONS[status], `missing transitions for ${status}`);
  }
});

test('a hospitalized patient never falls back to a waiting queue', () => {
  for (const to of [S.EN_ATTENTE_DE_PAIEMENT, S.EN_ATTENTE_VALIDATION_CAISSE, S.EN_ATTENTE_INFIRMERIE, S.EN_ATTENTE_MEDECIN]) {
    assert.deepEqual(decideWorkflowTransition(S.HOSPITALISE, to), { outcome: 'blocked', status: S.HOSPITALISE, requested: to });
  }
});

test('a consultation never falls back to the nurse or physician queue', () => {
  for (const to of [S.EN_ATTENTE_INFIRMERIE, S.EN_ATTENTE_MEDECIN]) {
    assert.deepEqual(decideWorkflowTransition(S.EN_CONSULTATION, to), { outcome: 'blocked', status: S.EN_CONSULTATION, requested: to });
  }
});

test('a consultation may send the patient to the cashier', () => {
  assert.equal(decideWorkflowTransition(S.EN_CONSULTATION, S.EN_ATTENTE_DE_PAIEMENT).outcome, 'applied');
  assert.equal(decideWorkflowTransition(S.EN_CONSULTATION, S.EN_ATTENTE_VALIDATION_CAISSE).outcome, 'applied');
});

test('a closed journey cannot jump straight into a technical service', () => {
  for (const from of [S.TERMINE, S.ANNULE]) {
    for (const to of [S.EN_LABORATOIRE, S.EN_RADIOLOGIE, S.EN_PHARMACIE]) {
      assert.equal(decideWorkflowTransition(from, to).outcome, 'blocked');
    }
  }
});

test('the usual patient journey is allowed step by step', () => {
  const journey = [S.EN_ATTENTE_DE_PAIEMENT, S.EN_ATTENTE_INFIRMERIE, S.EN_ATTENTE_MEDECIN, S.EN_CONSULTATION, S.EN_LABORATOIRE, S.EN_CONSULTATION, S.HOSPITALISE, S.TERMINE, S.EN_ATTENTE_MEDECIN];
  for (let i = 1; i < journey.length; i += 1) {
    assert.equal(decideWorkflowTransition(journey[i - 1], journey[i]).outcome, 'applied', `${journey[i - 1]} -> ${journey[i]}`);
  }
});

test('requesting the current status is reported as unchanged', () => {
  assert.deepEqual(decideWorkflowTransition(S.HOSPITALISE, S.HOSPITALISE), { outcome: 'unchanged', status: S.HOSPITALISE });
});
