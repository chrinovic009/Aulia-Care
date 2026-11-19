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
  const names = (await readdir(directory)).filter(n => /^aulia-care-.*\.dump\.age$/.test(n));
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
  return { ok: ageHours >= 0 && ageHours <= maxAgeHours, reason: ageHours > maxAgeHours ? 'stale_backup' : ageHours < 0 ? 'clock_mismatch' : 'ok', ageHours };
}
export async function checkHealth(target) {
  const url = new URL('/api/health/ready', target);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid monitoring target');
  try {
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(5000) });
    const result = await response.json();
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
    const result = { at: new Date().toISOString(), ok: health.ok && backup.ok, health, backup };
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
