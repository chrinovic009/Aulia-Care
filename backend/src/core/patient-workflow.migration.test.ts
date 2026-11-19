import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { PatientWorkflowStatus } from '@prisma/client';

import { ALLOWED_WORKFLOW_TRANSITIONS } from './patient-workflow.policy';

test('the database transition guard mirrors the Core state machine exactly', () => {
  // The latest migration redefining the guard is the one in force.
  const root = path.resolve(__dirname, '../../prisma/migrations');
  const latest = fs.readdirSync(root).filter((name) => /^\d+_patient_workflow_/.test(name)).sort().pop();
  assert.ok(latest, 'patient workflow guard migration not found');
  const dir = path.join(root, latest);
  const sql = fs.readFileSync(path.join(dir, 'migration.sql'), 'utf8');
  const restricted = new Map(
    [...sql.matchAll(/WHEN '([A-Z_]+)' THEN ARRAY\[([^\]]*)\]/g)].map((m) => [m[1], [...m[2].matchAll(/'([A-Z_]+)'/g)].map((v) => v[1]).sort()]),
  );
  for (const from of Object.values(PatientWorkflowStatus)) {
    const inCode = [...ALLOWED_WORKFLOW_TRANSITIONS[from]].filter((to) => to !== from).sort();
    const others = Object.values(PatientWorkflowStatus).filter((to) => to !== from).sort();
    assert.deepEqual(restricted.get(from) ?? others, inCode, `transitions from ${from}`);
  }
});
