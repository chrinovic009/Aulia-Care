// Quality ratchet: the number of `any` per source file, and the size of giant files, may only go down.
//   node scripts/quality/any-ratchet.mjs           -> fails if a file gained `any`
//   node scripts/quality/any-ratchet.mjs --update  -> records the new (lower) counts
// A new file starts at 0. Lowering a count is always allowed and is recorded with --update.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const baselinePath = join(root, 'scripts', 'quality', 'any-baseline.json');
const roots = ['backend/src', 'frontend/src'];
const sizeBaselinePath = join(root, 'scripts', 'quality', 'size-baseline.json');
/** Files above this many lines are "giant": they may shrink but never grow, and new ones are refused. */
export const MAX_LINES = 1500;
const pattern = /(?::\s*any\b|\bas\s+any\b|<any>|\bany\[\]|Array<any>|Record<string,\s*any>)/g;

export function countAny(text) {
  // Ignore comments so that documentation can mention the word freely.
  const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  return (code.match(pattern) ?? []).length;
}

async function walk(directory, files = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) { if (!['node_modules', 'dist', 'generated'].includes(entry.name)) await walk(path, files); }
    else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) files.push(path);
  }
  return files;
}

export async function measure() {
  const counts = {};
  const sizes = {};
  for (const base of roots) {
    for (const file of await walk(join(root, base))) {
      const text = await readFile(file, 'utf8');
      const name = relative(root, file).split(sep).join('/');
      const value = countAny(text);
      if (value) counts[name] = value;
      const lines = text.split('\n').length;
      if (lines > MAX_LINES) sizes[name] = lines;
    }
  }
  return { counts, sizes };
}

export function compareSizes(baseline, current) {
  return Object.entries(current)
    .filter(([file, lines]) => lines > Math.max(baseline[file] ?? 0, MAX_LINES))
    .map(([file, lines]) => ({ file, allowed: Math.max(baseline[file] ?? 0, MAX_LINES), value: lines }));
}

export function compare(baseline, current) {
  const worse = [];
  for (const [file, value] of Object.entries(current)) {
    const allowed = baseline[file] ?? 0;
    if (value > allowed) worse.push({ file, allowed, value });
  }
  const total = (counts) => Object.values(counts).reduce((sum, value) => sum + value, 0);
  return { worse, total: total(current), baselineTotal: total(baseline) };
}

const sortedJson = (value) => JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))), null, 2) + '\n';

async function main() {
  const { counts: current, sizes } = await measure();
  if (process.argv.includes('--update')) {
    await writeFile(baselinePath, sortedJson(current));
    await writeFile(sizeBaselinePath, sortedJson(sizes));
    console.log(`Référence "any" enregistrée : ${Object.values(current).reduce((a, b) => a + b, 0)}`);
    return;
  }
  const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
  const { worse, total, baselineTotal } = compare(baseline, current);
  const grown = compareSizes(JSON.parse(await readFile(sizeBaselinePath, 'utf8')), sizes);
  if (grown.length) {
    console.error(`Fichiers géants (> ${MAX_LINES} lignes) qui grossissent : découpez-les en modules.`);
    for (const item of grown) console.error(`  ${item.file} : ${item.allowed} -> ${item.value} lignes`);
    process.exitCode = 1;
  }
  if (worse.length) {
    console.error('Nouveaux "any" interdits (typez ces valeurs) :');
    for (const item of worse) console.error(`  ${item.file} : ${item.allowed} -> ${item.value}`);
    process.exitCode = 1;
    return;
  }
  console.log(`"any" : ${total} (référence ${baselineTotal})${total < baselineTotal ? ' — en baisse, lancer --update pour l’enregistrer' : ''}`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
