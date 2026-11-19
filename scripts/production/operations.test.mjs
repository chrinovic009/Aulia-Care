import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, utimes, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { validateLoadTarget, summarize, checkBackup } from './operations.mjs';
test('load test refuses remote targets and absent disposable confirmation', () => {
  assert.throws(() => validateLoadTarget('https://clinic.example', 'DISPOSABLE_DATABASE_ONLY'));
  assert.throws(() => validateLoadTarget('http://127.0.0.1:8090'));
  assert.equal(validateLoadTarget('http://127.0.0.1:8090', 'DISPOSABLE_DATABASE_ONLY').hostname, '127.0.0.1');
});
test('load errors and 429 responses cannot be reported as success', () => {
  assert.deepEqual(summarize([{ status: 200, ms: 10 }, { status: 429, ms: 20 }, { status: 500, ms: 30 }]), { requests: 3, failures: 2, errorRate: 2/3, p50Ms: 20, p95Ms: 30, p99Ms: 30, throttled: 1 });
});
test('backup check detects missing, corrupted and stale encrypted artifacts', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aulia-backup-test-'));
  try {
    assert.equal((await checkBackup(dir)).ok, false);
    const name = join(dir, 'aulia-care-test.dump.age');
    await writeFile(name, 'synthetic encrypted artifact');
    await writeFile(name + '.sha256', createHash('sha256').update('synthetic encrypted artifact').digest('hex'));
    assert.equal((await checkBackup(dir)).ok, true);
    await writeFile(name, 'tampered');
    assert.equal((await checkBackup(dir)).reason, 'checksum_mismatch');
    await writeFile(name, 'synthetic encrypted artifact');
    const old = new Date(Date.now() - 27*3600000);
    await utimes(name, old, old);
    assert.equal((await checkBackup(dir)).reason, 'stale_backup');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
