import assert from 'node:assert/strict';
import test from 'node:test';
import { MEDICAL_SPECIALTY_GROUPS, findSpecialty, isUnitBasedSpecialty } from './medical-specialties';

test('every group listed by the establishment is present, general practice first', () => {
  assert.deepEqual(MEDICAL_SPECIALTY_GROUPS.map((group) => group.code), ['MEDICAL', 'SURGICAL', 'WOMEN', 'PEDIATRIC', 'NEURO', 'SENSORY', 'DENTAL', 'PREVENTION', 'CRITICAL']);
  assert.equal(MEDICAL_SPECIALTY_GROUPS[0].specialties[0].label, 'Médecine générale');
  assert.equal(MEDICAL_SPECIALTY_GROUPS.find((group) => group.code === 'SURGICAL')!.specialties.length, 28);
  assert.equal(MEDICAL_SPECIALTY_GROUPS.find((group) => group.code === 'CRITICAL')!.specialties.length, 12);
});

test('a specialty is found whatever the case or accents, with one primary group', () => {
  assert.equal(findSpecialty('medecine generale')?.groupCode, 'MEDICAL');
  assert.equal(findSpecialty('Néonatologie')?.groupCode, 'PEDIATRIC');
  assert.equal(findSpecialty('Neurologie')?.template, 'NEURO');
  assert.equal(findSpecialty('Gynécologie-obstétrique')?.template, 'WOMEN');
  assert.equal(findSpecialty('Chirurgie maxillo-faciale')?.template, 'DENTAL');
  assert.equal(findSpecialty('Spécialité inventée'), null);
});

test('emergency, anaesthesia and intensive care doctors work from the care units', () => {
  assert.ok(isUnitBasedSpecialty('Anesthésiologie'));
  assert.ok(isUnitBasedSpecialty("Médecine d'urgence"));
  assert.ok(!isUnitBasedSpecialty('Médecine générale'));
});
