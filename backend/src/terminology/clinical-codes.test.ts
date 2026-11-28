import assert from 'node:assert/strict';
import test from 'node:test';
import { icd10Chapter, isValidCode, loincCheckDigitValid, normalizeCode, parseCodeFile } from './clinical-codes';

test('ICD-10 codes are normalised, validated and grouped by chapter', () => {
  assert.equal(normalizeCode('ICD10', ' b509 '), 'B50.9');
  assert.ok(isValidCode('ICD10', 'A09'));
  assert.ok(isValidCode('ICD10', 'S82.60'));
  assert.ok(!isValidCode('ICD10', 'A9'));
  assert.equal(icd10Chapter('B54'), 'I');
  assert.equal(icd10Chapter('D50'), 'III');
  assert.equal(icd10Chapter('D48'), 'II');
  assert.equal(icd10Chapter('H65'), 'VIII');
  assert.equal(icd10Chapter('T14'), 'XIX');
  assert.equal(icd10Chapter('O80'), 'XV');
});

test('LOINC codes carry a check digit', () => {
  assert.ok(loincCheckDigitValid('718-7'));
  assert.ok(loincCheckDigitValid('2345-7'));
  assert.ok(!loincCheckDigitValid('718-8'));
});

test('import files keep valid lines and report the others', () => {
  const { accepted, rejected } = parseCodeFile('LOINC', 'code;libellé\n718-7;Hémoglobine\n718-8;Faux\nabc;Mauvais\n');
  assert.deepEqual(accepted.map((row) => row.code), ['718-7']);
  assert.equal(rejected.length, 2);
});
