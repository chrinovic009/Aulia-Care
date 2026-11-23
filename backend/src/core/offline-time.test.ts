import test from 'node:test';
import assert from 'node:assert/strict';
import { BadRequestException } from '@nestjs/common';
import { resolveOfflineTime } from './offline-time';

test('an offline entry keeps its real time within 72 hours', () => {
  const now = new Date('2026-11-23T12:00:00Z');
  assert.equal(resolveOfflineTime(undefined, 'du soin', now), null);
  assert.equal(resolveOfflineTime('2026-11-22T08:00:00Z', 'du soin', now)?.toISOString(), '2026-11-22T08:00:00.000Z');
  assert.throws(() => resolveOfflineTime('2026-11-23T12:30:00Z', 'du soin', now), BadRequestException);
  assert.throws(() => resolveOfflineTime('2026-11-19T12:00:00Z', 'du soin', now), BadRequestException);
  assert.throws(() => resolveOfflineTime('pas une date', 'du soin', now), BadRequestException);
});
