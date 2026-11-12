import assert from 'node:assert/strict';
import test from 'node:test';
import { IDEMPOTENCY_KEY_PATTERN, canonicalJson, outcomeFor, requestFingerprint } from './idempotency';

test('the fingerprint ignores key order but not values, method or path', () => {
  const a = requestFingerprint('post', '/api/x', { b: 1, a: { d: [1, 2], c: 'v' } });
  assert.equal(a, requestFingerprint('POST', '/api/x', { a: { c: 'v', d: [1, 2] }, b: 1 }));
  assert.notEqual(a, requestFingerprint('POST', '/api/x', { b: 2, a: { d: [1, 2], c: 'v' } }));
  assert.notEqual(a, requestFingerprint('PATCH', '/api/x', { b: 1, a: { d: [1, 2], c: 'v' } }));
  assert.notEqual(a, requestFingerprint('POST', '/api/y', { b: 1, a: { d: [1, 2], c: 'v' } }));
  assert.equal(canonicalJson({ z: undefined, y: null }), '{"y":null}');
});

test('a key replays only the identical request, and never while the first one runs', () => {
  const fingerprint = 'abc';
  assert.deepEqual(outcomeFor(null, fingerprint), { kind: 'execute' });
  assert.deepEqual(outcomeFor({ requestHash: 'other', statusCode: 201, response: {} }, fingerprint), { kind: 'mismatch' });
  assert.deepEqual(outcomeFor({ requestHash: fingerprint, statusCode: 0, response: null }, fingerprint), { kind: 'in-progress' });
  assert.deepEqual(outcomeFor({ requestHash: fingerprint, statusCode: 201, response: { id: 1 } }, fingerprint), { kind: 'replay', statusCode: 201, response: { id: 1 } });
});

test('keys must be long, opaque and safe', () => {
  assert.ok(IDEMPOTENCY_KEY_PATTERN.test('3f2b9c1e-8a4d-4b7e-9f00-1234567890ab'));
  assert.ok(!IDEMPOTENCY_KEY_PATTERN.test('short'));
  assert.ok(!IDEMPOTENCY_KEY_PATTERN.test('x'.repeat(20) + ' ; drop'));
});
