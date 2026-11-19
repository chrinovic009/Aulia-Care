import test from 'node:test';
import assert from 'node:assert/strict';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateOwnAppointmentDto } from './create-own-appointment.dto';

const base = { serviceId: 's1', scheduledAt: '2026-11-25T10:00:00.000Z', durationMinutes: 30 };

test('demande patient : un motif texte jusqu’à 1000 caractères est accepté', () => {
  assert.equal(validateSync(plainToInstance(CreateOwnAppointmentDto, { ...base, reason: 'Contrôle de routine' })).length, 0);
  assert.equal(validateSync(plainToInstance(CreateOwnAppointmentDto, { ...base, reason: 'a'.repeat(1000) })).length, 0);
});

test('demande patient : un motif de plus de 1000 caractères est refusé', () => {
  assert.equal(validateSync(plainToInstance(CreateOwnAppointmentDto, { ...base, reason: 'a'.repeat(1001) })).length, 1);
});
