import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException } from '@nestjs/common';

import { isOfflineReplay, resolveRecordedTime } from './offline-time';

const now = new Date('2026-11-23T12:00:00Z');

test('en ligne, une heure envoyée par l’appareil est ignorée : impossible d’antidater un soin', () => {
  const time = resolveRecordedTime('2026-11-22T08:00:00Z', 'du soin', false, now);
  assert.equal(time.performedAt.toISOString(), now.toISOString());
  assert.equal(time.recordedOffline, false);
});

test('une saisie rejouée hors ligne garde son heure réelle, avec l’heure de réception et le marqueur hors ligne', () => {
  const time = resolveRecordedTime('2026-11-22T08:00:00Z', 'du soin', true, now);
  assert.equal(time.performedAt.toISOString(), '2026-11-22T08:00:00.000Z');
  assert.equal(time.receivedAt.toISOString(), now.toISOString());
  assert.equal(time.recordedOffline, true);
});

test('une saisie hors ligne de plus de 72 heures, future ou invalide est refusée', () => {
  assert.throws(() => resolveRecordedTime('2026-11-20T11:59:00Z', 'du soin', true, now), BadRequestException);
  assert.throws(() => resolveRecordedTime('2026-11-23T12:06:00Z', 'du soin', true, now), BadRequestException);
  assert.throws(() => resolveRecordedTime('pas une date', 'du soin', true, now), BadRequestException);
  assert.equal(resolveRecordedTime('2026-11-20T12:01:00Z', 'du soin', true, now).recordedOffline, true);
});

test('seul l’en-tête de rejeu exact active le mode hors ligne', () => {
  assert.equal(isOfflineReplay('1'), true);
  assert.equal(isOfflineReplay(undefined), false);
  assert.equal(isOfflineReplay('true'), false);
});
