import test from 'node:test';
import assert from 'node:assert/strict';
import { countAny, compare, compareSizes, MAX_LINES } from './any-ratchet.mjs';

test('counts type positions of any, not the word in comments or names', () => {
  assert.equal(countAny('const a: any = 1; const b = x as any; // any here\nconst company = 1; /* any */ let c: any[] = [];'), 3);
});
test('a file may only lose any; a new file starts at zero', () => {
  assert.deepEqual(compare({ 'a.ts': 3 }, { 'a.ts': 2 }).worse, []);
  assert.deepEqual(compare({ 'a.ts': 3 }, { 'a.ts': 4, 'b.ts': 1 }).worse, [{ file: 'a.ts', allowed: 3, value: 4 }, { file: 'b.ts', allowed: 0, value: 1 }]);
});
test('giant files may shrink but not grow, and no new giant file appears', () => {
  assert.deepEqual(compareSizes({ 'big.ts': 4000 }, { 'big.ts': 3900 }), []);
  assert.deepEqual(compareSizes({ 'big.ts': 4000 }, { 'big.ts': 4100, 'new.ts': MAX_LINES + 1 }), [{ file: 'big.ts', allowed: 4000, value: 4100 }, { file: 'new.ts', allowed: MAX_LINES, value: MAX_LINES + 1 }]);
});
