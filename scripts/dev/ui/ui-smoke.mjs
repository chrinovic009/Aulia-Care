// Aulia Care — UI smoke tests on the local demo (http://localhost:5190, fictitious data).
// Drives Edge/Chrome headless through the DevTools protocol (no extra package),
// signs in with each demo role and checks every main page really works:
//   * the page stays on its route (no bounce to /signin or to the home page),
//   * it renders a title and no "page introuvable",
//   * no uncaught JavaScript error, no API answer >= 500,
// plus targeted behaviours (role guard, offline banner, new pages).
// Report: .validation/ui/report.json ; exit code 1 when a check fails.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROLE_PAGES, evaluatePage } from './ui-checks.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const out = path.join(root, '.validation', 'ui');
fs.mkdirSync(path.join(out, 'failures'), { recursive: true });
const BASE = process.env.AULIA_UI_BASE || 'http://localhost:5190';
const credentials = fs.readFileSync(path.join(root, '.validation', 'demo', 'credentials.txt'), 'utf8');
const PASSWORD = (credentials.match(/Mot de passe\s*:\s*(\S+)/) || [])[1];
if (!PASSWORD) throw new Error('Mot de passe de démo introuvable : lancez d’abord la démo.');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const browserPath = [process.env.AULIA_TOUR_BROWSER, 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe']
  .filter(Boolean).find((candidate) => fs.existsSync(candidate));
if (!browserPath) throw new Error('Ni Edge ni Chrome trouvé.');
const port = 9400 + Math.floor(Math.random() * 400);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'aulia-ui-'));
const browser = spawn(browserPath, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--window-size=1440,900', '--no-first-run', '--disable-extensions', '--lang=fr-FR', 'about:blank'], { stdio: 'ignore' });

let wsUrl;
for (let i = 0; i < 60 && !wsUrl; i++) {
  try { wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((p) => p.type === 'page')?.webSocketDebuggerUrl; } catch { /* starting */ }
  if (!wsUrl) await sleep(500);
}
if (!wsUrl) throw new Error('Le navigateur ne répond pas.');
const ws = new WebSocket(wsUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let nextId = 1;
const pending = new Map();
const events = { exceptions: [], serverErrors: [] };
ws.onmessage = (message) => {
  const data = JSON.parse(String(message.data));
  if (data.id && pending.has(data.id)) {
    const { resolve, reject } = pending.get(data.id);
    pending.delete(data.id);
    if (data.error) reject(new Error(data.error.message)); else resolve(data.result);
  } else if (data.method === 'Runtime.exceptionThrown') {
    events.exceptions.push(data.params.exceptionDetails?.exception?.description?.split('\n')[0] || data.params.exceptionDetails?.text || 'exception');
  } else if (data.method === 'Network.responseReceived') {
    const { url, status } = data.params.response;
    if (status >= 500 && url.includes('/api/')) events.serverErrors.push(`${status} ${new URL(url).pathname}`);
  }
};
const cdp = (method, params = {}) => new Promise((resolve, reject) => { const id = nextId++; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
const js = async (expression) => {
  const result = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || 'Erreur JavaScript');
  return result.result?.value;
};
await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Network.enable');

async function settle() {
  const deadline = Date.now() + 20000;
  let quiet = 0;
  while (Date.now() < deadline && quiet < 3) {
    const busy = await js(`(() => {
      if (document.readyState !== 'complete') return true;
      const loader = document.querySelector('.aulia-page-loader');
      if (loader && !loader.classList.contains('aulia-page-loader--hidden')) return true;
      return [...document.querySelectorAll('.animate-spin')].some((el) => el.getBoundingClientRect().width > 0) || !document.body?.innerText.trim();
    })()`).catch(() => true);
    quiet = busy ? 0 : quiet + 1;
    await sleep(250);
  }
  await sleep(400);
}
async function go(route) { await cdp('Page.navigate', { url: BASE + route }); await sleep(300); await settle(); }
const snapshot = () => js(`({ path: location.pathname, text: (document.body?.innerText || '').slice(0, 20000), heading: [...document.querySelectorAll('h1,h2,h3')].map((h) => h.innerText.trim()).find(Boolean) || '' })`);

async function login(username) {
  await cdp('Network.clearBrowserCookies');
  await go('/signin');
  await js(`(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} })()`).catch(() => undefined);
  await go('/signin');
  const focus = (selector) => js(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.focus(); return true; })()`);
  await focus('input:not([type="password"]):not([type="checkbox"])');
  await cdp('Input.insertText', { text: username });
  await focus('input[type="password"]');
  await cdp('Input.insertText', { text: PASSWORD });
  await js(`document.querySelector('button[type="submit"]').click()`);
  for (let i = 0; i < 60; i++) { await sleep(250); if ((await js('location.pathname').catch(() => '/signin')) !== '/signin') break; }
  await settle();
  return (await js('location.pathname')) !== '/signin';
}

const results = [];
const record = async (role, route, check) => {
  results.push({ role, route, ...check });
  console.log(`${check.ok ? 'OK   ' : 'ECHEC'} ${role.padEnd(18)} ${route} ${check.ok ? '' : '— ' + check.problems.join(' ; ')}`);
  if (!check.ok) {
    const shot = await cdp('Page.captureScreenshot', { format: 'jpeg', quality: 70 }).catch(() => null);
    if (shot) fs.writeFileSync(path.join(out, 'failures', `${role}${route.replace(/[^a-z0-9]+/gi, '_')}.jpg`), Buffer.from(shot.data, 'base64'));
  }
};

for (const { username, role, pages } of ROLE_PAGES) {
  if (!(await login(username))) { await record(role, '/signin', { ok: false, problems: ['connexion impossible'] }); continue; }
  for (const item of pages) {
    events.exceptions.length = 0; events.serverErrors.length = 0;
    await go(item.route);
    await record(role, item.route, evaluatePage(item, await snapshot(), events));
  }
}

// Role guard: a physician must not reach the finance pages.
await login('demo.medecin');
await go('/finance/rapprochement-unites');
const guarded = await snapshot();
await record('médecin', '/finance/rapprochement-unites (interdit)', { ok: !guarded.text.includes('Rapprochement des examens'), problems: guarded.text.includes('Rapprochement des examens') ? ['page financière visible par un médecin'] : [] });

// Offline: the banner appears when the device loses the network.
await login('demo.infirmier');
await go('/nurse/rounds');
await cdp('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
await js(`window.dispatchEvent(new Event('offline'))`);
await sleep(1200);
const offline = await snapshot();
await cdp('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
await record('infirmier', '/nurse/rounds (hors ligne)', { ok: offline.text.includes('Hors ligne'), problems: offline.text.includes('Hors ligne') ? [] : ['bandeau « Hors ligne » absent'] });

const failed = results.filter((row) => !row.ok);
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ at: new Date().toISOString(), base: BASE, total: results.length, failed: failed.length, results }, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} vérifications réussies.`);
ws.close();
browser.kill();
process.exit(failed.length ? 1 : 0);
