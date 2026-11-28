import { stat, readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';

export function validateLoadTarget(value, confirmation) {
  const url = new URL(value);
  if (confirmation !== 'DISPOSABLE_DATABASE_ONLY' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Load tests require a disposable local server and explicit confirmation.');
  }
  return url;
}
export function summarize(samples) {
  const values = samples.map(x => x.ms).sort((a, b) => a - b);
  const count = samples.length;
  const failures = samples.filter(x => x.status < 200 || x.status >= 300).length;
  const percentile = p => values[Math.max(0, Math.ceil(values.length * p) - 1)] ?? 0;
  return { requests: count, failures, errorRate: count ? failures / count : 1, p50Ms: percentile(.5), p95Ms: percentile(.95), p99Ms: percentile(.99), throttled: samples.filter(x => x.status === 429).length };
}
export async function loadTest({ target, confirmation, concurrency = 10, requests = 100, path = '/api/health/ready', headers = {}, p95LimitMs = 1500, errorLimit = .01 }) {
  const url = validateLoadTarget(target, confirmation);
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 100 || !Number.isInteger(requests) || requests < concurrency || requests > 10000 || !path.startsWith('/api/') || path.startsWith('//') || path.includes('..')) throw new Error('Invalid bounded load-test settings.');
  // Never follow a redirect from the local disposable target.
  const endpoint = new URL(path, url.origin);
  const samples = [];
  let next = 0;
  const start = performance.now();
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (next++ < requests) {
      const at = performance.now();
      try {
        const response = await fetch(endpoint, { headers, redirect: 'error', signal: AbortSignal.timeout(5000) });
        await response.arrayBuffer();
        samples.push({ status: response.status, ms: performance.now() - at });
      } catch { samples.push({ status: 0, ms: performance.now() - at }); }
    }
  }));
  const result = summarize(samples);
  return { ...result, concurrency, elapsedMs: performance.now() - start, passed: result.errorRate <= errorLimit && result.p95Ms <= p95LimitMs };
}
export async function checkBackup(directory, maxAgeHours = 26) {
  const entries = await readdir(directory);
  if (entries.some(n => /^aulia-care-.*\.dump(?:\.sha256)?$/.test(n))) return { ok: false, reason: 'plaintext_backup_present' };
  const names = entries.filter(n => /^aulia-care-.*\.dump\.age$/.test(n));
  const files = await Promise.all(names.map(async name => ({ name, info: await stat(join(directory, name)) })));
  files.sort((a, b) => b.info.mtimeMs - a.info.mtimeMs);
  const newest = files[0];
  if (!newest || newest.info.size === 0) return { ok: false, reason: 'missing_backup' };
  const ageHours = (Date.now() - newest.info.mtimeMs) / 3600000;
  const checksum = (await readFile(join(directory, newest.name + '.sha256'), 'utf8')).trim().split(/\s+/)[0];
  if (!/^[a-f0-9]{64}$/i.test(checksum)) return { ok: false, reason: 'invalid_checksum' };
  // Stream hashes: avoid loading a large clinical database dump into RAM.
  const { createReadStream } = await import('node:fs');
  const { createHash } = await import('node:crypto');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(join(directory, newest.name))) hash.update(chunk);
  if (hash.digest('hex').toLowerCase() !== checksum.toLowerCase()) return { ok: false, reason: 'checksum_mismatch' };
  // A few minutes of skew between the file system clock and Node's clock are not a mismatch (Windows).
  const skew = -0.25;
  return { ok: ageHours >= skew && ageHours <= maxAgeHours, reason: ageHours > maxAgeHours ? 'stale_backup' : ageHours < skew ? 'clock_mismatch' : 'ok', ageHours };
}
/**
 * Key custody: the server only needs the age PUBLIC key (recipient) to encrypt
 * backups. A private key (AGE-SECRET-KEY-…) found on it means a stolen server
 * also gives away every backup, so it is reported as an alert.
 */
export async function checkKeyCustody(directories) {
  for (const directory of directories.filter(Boolean)) {
    let entries = [];
    try { entries = await readdir(directory); } catch { continue; }
    for (const name of entries) {
      const path = join(directory, name);
      const info = await stat(path).catch(() => null);
      if (!info?.isFile() || info.size > 1024 * 1024) continue;
      const text = await readFile(path, 'utf8').catch(() => '');
      if (text.includes('AGE-SECRET-KEY-')) return { ok: false, reason: 'private_key_on_server', file: name };
    }
  }
  return { ok: true, reason: 'ok' };
}
/** Off-site copy: the newest encrypted backup must also exist, identical, outside the server. */
export async function checkOffsite(directory, offsiteDirectory) {
  if (!offsiteDirectory) return { ok: false, reason: 'offsite_not_configured' };
  const names = (await readdir(directory)).filter(n => /^aulia-care-.*\.dump\.age$/.test(n));
  const dated = await Promise.all(names.map(async name => ({ name, mtimeMs: (await stat(join(directory, name))).mtimeMs })));
  const newest = dated.sort((a, b) => b.mtimeMs - a.mtimeMs)[0];
  if (!newest) return { ok: false, reason: 'missing_backup' };
  const local = (await readFile(join(directory, newest.name + '.sha256'), 'utf8').catch(() => '')).trim().split(/\s+/)[0];
  const remote = (await readFile(join(offsiteDirectory, newest.name + '.sha256'), 'utf8').catch(() => '')).trim().split(/\s+/)[0];
  const copy = await stat(join(offsiteDirectory, newest.name)).catch(() => null);
  if (!copy || !remote) return { ok: false, reason: 'offsite_copy_missing' };
  return remote.toLowerCase() === local.toLowerCase() ? { ok: true, reason: 'ok' } : { ok: false, reason: 'offsite_checksum_mismatch' };
}
/** Free disk space where backups and the database live. */
export async function checkDisk(directory, minFreeGb = 10) {
  const { statfs } = await import('node:fs/promises');
  const info = await statfs(directory);
  const freeGb = (Number(info.bavail) * Number(info.bsize)) / 1024 ** 3;
  return { ok: freeGb >= minFreeGb, reason: freeGb >= minFreeGb ? 'ok' : 'low_disk_space', freeGb: Math.round(freeGb * 10) / 10 };
}
/**
 * Alert message: reasons only. No patient data, token, URL or password ever
 * leaves the server through an alert.
 */
export function alertPayload(result, site = 'Aulia Care') {
  const failing = Object.entries(result).filter(([, value]) => value && typeof value === 'object' && value.ok === false).map(([name, value]) => `${name}: ${value.reason ?? 'échec'}`);
  return { text: result.ok ? `[${site}] Contrôles revenus à la normale.` : `[${site}] ALERTE exploitation — ${failing.join(' ; ') || 'contrôle en échec'}`, ok: result.ok, at: result.at };
}
export async function sendAlert(webhook, payload) {
  if (!webhook) return { sent: false, reason: 'no_webhook' };
  const url = new URL(webhook);
  if (url.protocol !== 'https:') throw new Error('Alert webhook must use HTTPS');
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), redirect: 'error', signal: AbortSignal.timeout(10000) });
  return { sent: response.ok, status: response.status };
}
export async function checkHealth(target) {
  const url = new URL('/api/health/ready', target);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid monitoring target');
  try {
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(5000) });
    const result = await response.json();
    // Audit refusals waiting on disk mean the database lost writes: alert even if ready.
    const pendingAudits = Number(result?.checks?.pendingAudits ?? 0);
    if (pendingAudits !== 0) return { ok: false, status: response.status, reason: 'audit_spool_pending', pendingAudits };
    return { ok: response.status === 200 && result.status === 'ready', status: response.status };
  } catch { return { ok: false, status: 0 }; }
}
async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'load') {
    const report = await loadTest({ target: args[0], confirmation: process.env.AULIA_LOAD_TEST_CONFIRM, concurrency: Number(args[1] || 10), requests: Number(args[2] || 100), path: process.env.AULIA_LOAD_TEST_PATH || '/api/health/ready', headers: process.env.AULIA_LOAD_TEST_COOKIE ? { Cookie: process.env.AULIA_LOAD_TEST_COOKIE } : {} });
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.passed ? 0 : 1;
  } else if (command === 'monitor') {
    const [target, backupDirectory, outputDirectory] = args;
    if (!target || !backupDirectory || !outputDirectory) throw new Error('monitor needs target, backup directory and output directory');
    const health = await checkHealth(target);
    const backup = await checkBackup(backupDirectory).catch(() => ({ ok: false, reason: 'backup_unreadable' }));
    const keys = await checkKeyCustody([process.env.AULIA_KEYS_DIR, process.env.AULIA_SECRETS_DIR]).catch(() => ({ ok: false, reason: 'keys_unreadable' }));
    const offsite = await checkOffsite(backupDirectory, process.env.AULIA_BACKUP_OFFSITE_DIR).catch(() => ({ ok: false, reason: 'offsite_unreadable' }));
    const disk = await checkDisk(backupDirectory, Number(process.env.AULIA_MIN_FREE_GB || 10)).catch(() => ({ ok: false, reason: 'disk_unreadable' }));
    const result = { at: new Date().toISOString(), ok: health.ok && backup.ok && keys.ok && offsite.ok && disk.ok, health, backup, keys, offsite, disk };
    // Alert on failure, and once when it comes back to normal (no repeated "OK" noise).
    const previous = JSON.parse(await readFile(join(outputDirectory, 'operations-status.json'), 'utf8').catch(() => '{}'));
    if (!result.ok || previous.ok === false) {
      result.alert = await sendAlert(process.env.AULIA_ALERT_WEBHOOK_URL, alertPayload(result)).catch(() => ({ sent: false, reason: 'webhook_failed' }));
    }
    await mkdir(outputDirectory, { recursive: true, mode: 0o700 });
    await writeFile(join(outputDirectory, 'operations-status.json'), JSON.stringify(result, null, 2), { mode: 0o600 });
    // This alert file contains no patient data, tokens, URLs or passwords.
    const alertPath = join(outputDirectory, 'ALERTE.txt');
    await writeFile(alertPath, result.ok ? 'OK — contrôles réussis.' : 'ALERTE — vérifier le serveur et la sauvegarde. Ne pas supprimer les anciennes sauvegardes.', { mode: 0o600 });
    console.log(JSON.stringify(result));
    process.exitCode = result.ok ? 0 : 1;
  } else throw new Error('Expected load or monitor command');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(() => { console.error('Operations check failed. Inspect local protected logs.'); process.exitCode = 1; });
