import assert from 'node:assert/strict';
import test from 'node:test';
import { fingerprint, sealProtocolValidations, withProtocolValidation } from './protocol-validation';

const who = { validatedById: 'u1', validatedByName: 'Dr Test', validatedByRole: 'PHYSICIAN', validatedAt: '2026-11-16T10:00:00.000Z', comment: null };

test('the administration cannot mark a protocol validated by itself', () => {
  const sealed = sealProtocolValidations('EMERGENCY', {}, { triageScale: [{ code: '1', label: 'Immédiat' }], triageScaleValidated: true, protocolValidations: { TRIAGE_SCALE: { fingerprint: 'forged' } } });
  assert.equal(sealed.triageScaleValidated, false);
  assert.equal(sealed.protocolValidations, undefined);
});

test('a clinician validation holds while the content is unchanged and lapses when it changes', () => {
  const settings = { triageScale: [{ code: '1', label: 'Immédiat', maxWaitMinutes: 0 }] };
  const validated = withProtocolValidation(settings, 'TRIAGE_SCALE', who);
  assert.equal(validated.triageScaleValidated, true);
  // Same content saved again (keys reordered, flag forged false): still validated.
  const resaved = sealProtocolValidations('EMERGENCY', validated, { triageScale: [{ maxWaitMinutes: 0, label: 'Immédiat', code: '1' }], triageScaleValidated: false });
  assert.equal(resaved.triageScaleValidated, true);
  const changed = sealProtocolValidations('EMERGENCY', validated, { triageScale: [{ code: '1', label: 'Immédiat', maxWaitMinutes: 10 }] });
  assert.equal(changed.triageScaleValidated, false);
  assert.equal(changed.protocolValidations, undefined);
});

test('the partogram flag lives inside its settings and does not enter the fingerprint', () => {
  const settings = { partogram: { alertLineFromCm: 4, alertRateCmPerHour: 1, actionLineOffsetHours: 4, validated: false } };
  const validated = withProtocolValidation(settings, 'PARTOGRAM', { ...who, validatedByRole: 'MIDWIFE' });
  assert.equal((validated.partogram as { validated: boolean }).validated, true);
  const resaved = sealProtocolValidations('MATERNITY', validated, { partogram: { alertLineFromCm: 4, alertRateCmPerHour: 1, actionLineOffsetHours: 4, validated: false } });
  assert.equal((resaved.partogram as { validated: boolean }).validated, true);
  assert.equal(fingerprint({ b: 1, a: [2] }), fingerprint({ a: [2], b: 1 }));
});
