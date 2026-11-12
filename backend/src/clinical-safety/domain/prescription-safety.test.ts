import assert from 'node:assert/strict';
import test from 'node:test';
import {
  allergyAlerts,
  canonicalSubstance,
  evaluatePrescriptionSafety,
  interactionAlerts,
  medicationMatches,
  normalizeTerm,
} from './prescription-safety';

// Test fixtures only: generic placeholder substances, no clinical claim.
const alpha = { id: 'm-alpha', name: 'Alphadol 500 mg', activeSubstance: 'Substance-Alpha', atcCode: 'X01AB02' };
const beta = { id: 'm-beta', name: 'Betarex', activeSubstance: 'substance beta', atcCode: 'Y02CA01' };
const gamma = { id: 'm-gamma', name: 'Gammaline', activeSubstance: null, atcCode: null };

test('terms are compared without case, accents or punctuation', () => {
  assert.equal(normalizeTerm('  Pénicilline-G  '), 'penicilline g');
  assert.equal(canonicalSubstance('x01 ab'), 'x01ab');
  assert.equal(canonicalSubstance('Substance-Alpha'), 'substance alpha');
});

test('a substance matches the DCI or the name as whole words, or an ATC prefix', () => {
  assert.ok(medicationMatches(alpha, 'substance alpha'));
  assert.ok(medicationMatches(alpha, 'ALPHADOL'));
  assert.ok(medicationMatches(alpha, 'X01A'), 'an ATC prefix covers the whole class');
  assert.ok(!medicationMatches(alpha, 'Y02'));
  assert.ok(!medicationMatches(alpha, 'alph'), 'no partial word match');
  assert.ok(!medicationMatches(alpha, 'al'), 'terms shorter than 3 characters never match');
  assert.ok(medicationMatches(gamma, 'gammaline'), 'name still works when DCI is not filled in');
});

test('a documented allergy to a prescribed medication is always blocking', () => {
  const alerts = allergyAlerts([{ id: 'a1', substance: 'Substance alpha', severity: 'MILD', reaction: 'urticaire' }], [alpha, beta]);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].blocking, true);
  assert.deepEqual(alerts[0].medicationIds, ['m-alpha']);
  assert.match(alerts[0].message, /urticaire/);
  assert.deepEqual(allergyAlerts([{ id: 'a2', substance: 'autre', severity: 'SEVERE' }], [alpha]), []);
});

test('interaction rules apply between prescribed medications and with treatments in progress, in both directions', () => {
  const rule = { id: 'r1', substanceA: 'substance beta', substanceB: 'x01', severity: 'MAJOR' as const, effect: 'effet documenté', source: 'Référence locale' };
  const between = interactionAlerts([rule], [alpha, beta], []);
  assert.equal(between.length, 1);
  assert.equal(between[0].blocking, true);
  const withCurrent = interactionAlerts([rule], [beta], [alpha]);
  assert.equal(withCurrent.length, 1);
  assert.deepEqual(interactionAlerts([rule], [beta], [gamma]), []);
});

test('minor and moderate interactions warn without blocking', () => {
  for (const severity of ['MINOR', 'MODERATE'] as const) {
    const [alert] = interactionAlerts([{ id: 'r', substanceA: 'substance alpha', substanceB: 'substance beta', severity, effect: 'e', source: 's' }], [alpha, beta], []);
    assert.equal(alert.blocking, false);
  }
});

test('the evaluation is blocking as soon as one alert is', () => {
  const safe = evaluatePrescriptionSafety({ allergies: [], rules: [], prescribed: [alpha], current: [] });
  assert.deepEqual(safe, { alerts: [], blocking: false });
  const unsafe = evaluatePrescriptionSafety({
    allergies: [{ id: 'a1', substance: 'betarex', severity: 'MODERATE' }],
    rules: [{ id: 'r', substanceA: 'substance alpha', substanceB: 'gammaline', severity: 'MINOR', effect: 'e', source: 's' }],
    prescribed: [alpha, beta, gamma],
    current: [],
  });
  assert.equal(unsafe.alerts.length, 2);
  assert.equal(unsafe.blocking, true);
});
