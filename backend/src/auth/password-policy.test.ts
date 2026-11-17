import assert from 'node:assert/strict';
import test from 'node:test';
import { generateTemporaryPassword, passwordPolicyError } from './password-policy';

test('temporary codes are 6 random digits', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 300; i += 1) {
    const value = generateTemporaryPassword();
    assert.match(value, /^\d{6}$/);
    seen.add(value);
  }
  assert.ok(seen.size > 290);
});

test('a chosen password has at least 6 characters with a letter, a digit and a symbol', () => {
  assert.ok(passwordPolicyError('a1!'));
  assert.ok(passwordPolicyError('abcdef1'));
  assert.ok(passwordPolicyError('abcdef!'));
  assert.ok(passwordPolicyError('123456!'));
  assert.equal(passwordPolicyError('kbs#2026'), null);
  assert.equal(passwordPolicyError('Élan-7'), null);
});
