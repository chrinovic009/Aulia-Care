import test from 'node:test';
import assert from 'node:assert/strict';
import { ROLE_PAGES, evaluatePage } from './ui-checks.mjs';

const clean = { exceptions: [], serverErrors: [] };
test('a working page passes', () => {
  assert.deepEqual(evaluatePage({ route: '/doctor/' }, { path: '/doctor', heading: 'Tableau de bord', text: 'Bonjour' }, clean), { ok: true, problems: [] });
});
test('redirects, missing titles, JS errors and 5xx fail the page', () => {
  const result = evaluatePage({ route: '/finance', expect: 'Recettes' }, { path: '/signin', heading: '', text: '' }, { exceptions: ['TypeError: x is undefined'], serverErrors: ['500 /api/finance'] });
  assert.equal(result.ok, false);
  assert.equal(result.problems.length, 5);
});
test('every demo role has pages to check', () => {
  assert.ok(ROLE_PAGES.length >= 10);
  for (const entry of ROLE_PAGES) assert.ok(entry.pages.length > 0 && entry.pages.every((page) => page.route.startsWith('/')));
});
