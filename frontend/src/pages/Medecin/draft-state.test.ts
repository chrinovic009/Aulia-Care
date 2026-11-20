import assert from 'node:assert/strict';
import test from 'node:test';
import { canPersistDraft, draftDiagnosis, draftKey } from './draft-state';

test('a draft cannot save before restoration or during a recovery decision', () => {
  assert.equal(canPersistDraft('draft-1', null, false), false);
  assert.equal(canPersistDraft('draft-1', draftKey('draft-1'), true), false);
  assert.equal(canPersistDraft('draft-1', draftKey('draft-1'), false), true);
});
test('draft diagnosis preserves the principal and all hypotheses', () => {
  assert.deepEqual(draftDiagnosis('Diagnostic fictif', ' Première\n\nSeconde ', 'Description'), {
    principal: 'Diagnostic fictif', hypotheses: ['Première', 'Seconde'], description: 'Description',
  });
});