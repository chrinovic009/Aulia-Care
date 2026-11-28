import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, utimes, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { validateLoadTarget, summarize, checkBackup, checkKeyCustody, checkOffsite, alertPayload } from './operations.mjs';
import { mkdir, copyFile } from 'node:fs/promises';
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

test('monitor rejects plaintext backups even alongside a valid encrypted backup', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aulia-plaintext-test-'));
  try {
    await writeFile(join(dir, 'aulia-care-test.dump.age'), 'encrypted');
    await writeFile(join(dir, 'aulia-care-test.dump.age.sha256'), createHash('sha256').update('encrypted').digest('hex'));
    await writeFile(join(dir, 'aulia-care-leftover.dump'), 'synthetic plaintext');
    assert.deepEqual(await checkBackup(dir), { ok: false, reason: 'plaintext_backup_present' });
    await rm(join(dir, 'aulia-care-leftover.dump'));
    assert.equal((await checkBackup(dir)).ok, true);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('a private backup key left on the server is an alert', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aulia-keys-test-'));
  try {
    await writeFile(join(dir, 'backup-recipient.txt'), 'age1synthetic');
    assert.equal((await checkKeyCustody([dir])).ok, true);
    await writeFile(join(dir, 'backup-identity.txt'), '# synthetic\nAGE-SECRET-KEY-1SYNTHETIC');
    assert.deepEqual(await checkKeyCustody([dir]), { ok: false, reason: 'private_key_on_server', file: 'backup-identity.txt' });
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('the newest encrypted backup must have an identical off-site copy', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aulia-offsite-test-'));
  const remote = join(dir, 'remote');
  try {
    await mkdir(remote);
    const name = 'aulia-care-test.dump.age';
    await writeFile(join(dir, name), 'encrypted');
    await writeFile(join(dir, name + '.sha256'), createHash('sha256').update('encrypted').digest('hex'));
    assert.equal((await checkOffsite(dir, undefined)).reason, 'offsite_not_configured');
    assert.equal((await checkOffsite(dir, remote)).reason, 'offsite_copy_missing');
    await copyFile(join(dir, name), join(remote, name));
    await copyFile(join(dir, name + '.sha256'), join(remote, name + '.sha256'));
    assert.equal((await checkOffsite(dir, remote)).ok, true);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('alerts name the failing checks and carry no secret', () => {
  const payload = alertPayload({ at: 'x', ok: false, health: { ok: true }, backup: { ok: false, reason: 'stale_backup' }, keys: { ok: false, reason: 'private_key_on_server', file: 'k.txt' } });
  assert.match(payload.text, /backup: stale_backup/);
  assert.match(payload.text, /keys: private_key_on_server/);
  assert.doesNotMatch(payload.text, /k\.txt|http|password/i);
});
