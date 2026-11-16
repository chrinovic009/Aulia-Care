import assert from 'node:assert/strict';
import test from 'node:test';
import { generateTemporaryPassword, passwordPolicyError } from './password-policy';

test('temporary passwords are random, well-formed and accepted by the policy', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 200; i += 1) {
    const value = generateTemporaryPassword();
    assert.match(value, /^[A-Za-z2-9]{4}-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}$/);
    assert.match(value, /[A-Z]/);
    assert.match(value, /[a-z]/);
    assert.match(value, /\d/);
    assert.doesNotMatch(value, /[01OIl]/);
    seen.add(value);
  }
  assert.equal(seen.size, 200);
});

test('password policy refuses short, letter-only, personal or common passwords', () => {
  assert.ok(passwordPolicyError('court1'));
  assert.ok(passwordPolicyError('seulementdeslettres'));
  assert.ok(passwordPolicyError('jdupont2026xx', { username: 'jdupont' }));
  assert.ok(passwordPolicyError('Aulia2026care'));
  assert.equal(passwordPolicyError('Bonjour-Kolwezi-48'), null);
});
