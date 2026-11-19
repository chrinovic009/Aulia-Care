import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ENTERED_IN_ERROR_EVENT,
  WorkflowRuleError,
  allowedTransitions,
  assertClosable,
  assertCorrection,
  assertReassignment,
  assertTransition,
  closureRequirementsFromSettings,
  eventsInForce,
  isTerminal,
  missingClosureRequirements,
  unitRoleAllows,
} from './workflow-rules';

const ruleError = (code: string) => (error: unknown) => error instanceof WorkflowRuleError && error.code === code;

test('a request is executed through tasks and events: it can be completed but never reopened', () => {
  assert.equal(assertTransition('serviceRequest', 'ACTIVE', 'COMPLETED'), null);
  assert.ok(isTerminal('serviceRequest', 'COMPLETED'));
  assert.throws(() => assertTransition('serviceRequest', 'COMPLETED', 'ACTIVE'), ruleError('TRANSITION_NOT_ALLOWED'));
});

test('revoking, suspending or flagging a request in error needs a written reason', () => {
  for (const target of ['REVOKED', 'ON_HOLD', 'ENTERED_IN_ERROR']) {
    assert.throws(() => assertTransition('serviceRequest', 'ACTIVE', target), ruleError('REASON_REQUIRED'), target);
    assert.throws(() => assertTransition('serviceRequest', 'ACTIVE', target, '   '), ruleError('REASON_REQUIRED'), target);
  }
  assert.equal(assertTransition('serviceRequest', 'ACTIVE', 'REVOKED', '  Patient transféré  '), 'Patient transféré');
});

test('a receiving unit accepts or refuses a task, and a refusal must be motivated', () => {
  assert.deepEqual([...allowedTransitions('task', 'REQUESTED')], ['RECEIVED', 'ACCEPTED', 'REJECTED', 'CANCELLED']);
  assert.throws(() => assertTransition('task', 'REQUESTED', 'REJECTED'), ruleError('REASON_REQUIRED'));
  assert.equal(assertTransition('task', 'RECEIVED', 'REJECTED', 'Bloc complet ce jour'), 'Bloc complet ce jour');
});

test('a task cannot be completed before it was started', () => {
  assert.throws(() => assertTransition('task', 'ACCEPTED', 'COMPLETED'), ruleError('TRANSITION_NOT_ALLOWED'));
  assert.equal(assertTransition('task', 'IN_PROGRESS', 'COMPLETED'), null);
});

test('a planned episode cannot jump to closed; a closed episode is final', () => {
  assert.throws(() => assertTransition('episode', 'PLANNED', 'COMPLETED'), ruleError('TRANSITION_NOT_ALLOWED'));
  assert.equal(assertTransition('episode', 'IN_PROGRESS', 'COMPLETED'), null);
  assert.ok(isTerminal('episode', 'COMPLETED'));
});

test('a transfer is acknowledged by the receiver; refusing or cancelling it needs a reason', () => {
  assert.equal(assertTransition('transfer', 'SENT', 'RECEIVED'), null);
  assert.equal(assertTransition('transfer', 'RECEIVED', 'ACCEPTED'), null);
  assert.throws(() => assertTransition('transfer', 'SENT', 'REJECTED'), ruleError('REASON_REQUIRED'));
  assert.throws(() => assertTransition('transfer', 'ACCEPTED', 'REJECTED', 'trop tard'), ruleError('TRANSITION_NOT_ALLOWED'));
});

test('a status change to the same status and unknown statuses are refused', () => {
  assert.throws(() => assertTransition('task', 'ACCEPTED', 'ACCEPTED'), ruleError('NO_CHANGE'));
  assert.throws(() => assertTransition('task', 'ACCEPTED', 'DONE'), ruleError('UNKNOWN_STATUS'));
  assert.throws(() => isTerminal('episode', 'ARCHIVED'), ruleError('UNKNOWN_STATUS'));
});

test('reassigning owned work needs a justification; first assignment does not', () => {
  assert.equal(assertReassignment(null, 'nurse-2'), null);
  assert.equal(assertReassignment('nurse-1', 'nurse-1'), null);
  assert.throws(() => assertReassignment('nurse-1', 'nurse-2'), ruleError('REASON_REQUIRED'));
  assert.throws(() => assertReassignment('nurse-1', null), ruleError('REASON_REQUIRED'));
  assert.equal(assertReassignment('nurse-1', 'nurse-2', 'fin de garde'), 'fin de garde');
});

test('unit roles: read-only reads, members write, leads also validate, reassign and configure', () => {
  assert.ok(unitRoleAllows('READ_ONLY', 'read'));
  assert.ok(!unitRoleAllows('READ_ONLY', 'write'));
  assert.ok(unitRoleAllows('MEMBER', 'write'));
  assert.ok(!unitRoleAllows('MEMBER', 'reassign'));
  assert.ok(unitRoleAllows('LEAD', 'configure'));
  assert.ok(!unitRoleAllows(null, 'read'));
});

test('a corrected event is no longer in force but stays in the history', () => {
  const events = [
    { id: 'e1', type: 'TRIAGE' },
    { id: 'e2', type: 'TRIAGE', correctsEventId: 'e1' },
    { id: 'e3', type: 'VITALS' },
    { id: 'e4', type: ENTERED_IN_ERROR_EVENT, correctsEventId: 'e3' },
  ];
  assert.deepEqual(eventsInForce(events).map((event) => event.id), ['e2']);
  assert.equal(events.length, 4);
});

test('a correction needs the original event and a reason', () => {
  assert.throws(() => assertCorrection(null, 'erreur'), ruleError('EVENT_NOT_FOUND'));
  assert.throws(() => assertCorrection({ id: 'e1', type: 'TRIAGE' }, ' '), ruleError('REASON_REQUIRED'));
  assert.equal(assertCorrection({ id: 'e1', type: 'TRIAGE' }, ' mauvais patient '), 'mauvais patient');
});

test('closure lists every mandatory step still missing, ignoring retracted events', () => {
  const requirements = [
    { eventType: 'TRIAGE', label: 'Triage' },
    { eventType: 'ORIENTATION', label: "Décision d'orientation" },
  ];
  const events = [
    { id: 'e1', type: 'TRIAGE' },
    { id: 'e2', type: 'ORIENTATION' },
    { id: 'e3', type: ENTERED_IN_ERROR_EVENT, correctsEventId: 'e2' },
  ];
  assert.deepEqual(missingClosureRequirements(requirements, events), ["Décision d'orientation"]);
  assert.throws(() => assertClosable(requirements, events), ruleError('MANDATORY_STEPS_MISSING'));
  assert.doesNotThrow(() => assertClosable(requirements, [...events, { id: 'e4', type: 'ORIENTATION' }]));
  assert.doesNotThrow(() => assertClosable(undefined, []));
});

test('closure requirements are read defensively from unit settings', () => {
  assert.deepEqual(closureRequirementsFromSettings(null), []);
  assert.deepEqual(closureRequirementsFromSettings({ closureRequirements: 'TRIAGE' }), []);
  assert.deepEqual(
    closureRequirementsFromSettings({ closureRequirements: [{ eventType: ' TRIAGE ', label: 'Triage' }, { eventType: 'X' }, { eventType: '', label: 'vide' }] }),
    [{ eventType: 'TRIAGE', label: 'Triage' }],
  );
});
