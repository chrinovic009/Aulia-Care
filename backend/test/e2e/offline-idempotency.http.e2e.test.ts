import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import * as bcrypt from 'bcrypt';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AuliaLayer, PrismaClient } from '@prisma/client';
import { AppModule } from '../../src/app.module';

const databaseUrl = process.env.TEST_DATABASE_URL;

test('HTTP E2E hors ligne : une saisie rejouée avec la même clé n’est appliquée qu’une fois, à son heure réelle', { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const suffix = randomUUID().slice(0, 12);
  const password = 'E2E-Strong-Password-2026!';
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  let app: INestApplication | undefined;
  let clinicId: string | undefined;
  let nurseId: string | undefined;

  try {
    process.env.DATABASE_URL = databaseUrl;
    process.env.JWT_SECRET ??= 'http_e2e_access_secret';
    process.env.JWT_REFRESH_SECRET ??= 'http_e2e_refresh_secret';
    process.env.CORS_ORIGIN ??= 'http://localhost:5173';

    const clinic = await prisma.clinic.create({ data: { name: `Offline E2E ${suffix}` } });
    clinicId = clinic.id;
    await prisma.platformLayerConfiguration.create({
      data: { clinicId, enabledLayers: [AuliaLayer.CORE], configuredAt: new Date(), configurationVersion: 1 },
    });
    const nurse = await prisma.user.create({
      data: {
        clinicId, email: `nurse-${suffix}@e2e.local`, username: `nurse-${suffix}`, displayName: 'Infirmier E2E',
        firstName: 'Infirmier', lastName: 'E2E', passwordHash: await bcrypt.hash(password, 10), primaryRole: 'NURSE',
      },
    });
    nurseId = nurse.id;
    const patient = await prisma.patient.create({
      data: { clinicId, firstName: 'Patient', lastName: `OFF-${suffix}`, gender: 'OTHER', dateOfBirth: new Date('1990-01-01T00:00:00.000Z') },
    });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    const server = app.getHttpServer();

    const login = await request(server).post('/api/auth/login').send({ identifier: nurse.username, password }).expect(200);
    const cookies = login.headers['set-cookie'];
    const key = randomUUID();
    const measuredAt = new Date(Date.now() - 2 * 3_600_000).toISOString();
    const body = { temperature: '38.4', heartRate: '96', measuredAt };

    const first = await request(server).post(`/api/patients/${patient.id}/vital-signs`).set('Cookie', cookies).set('Idempotency-Key', key).send(body);
    assert.ok(first.status >= 200 && first.status < 300, `first write failed: ${first.status} ${JSON.stringify(first.body)}`);
    const replay = await request(server).post(`/api/patients/${patient.id}/vital-signs`).set('Cookie', cookies).set('Idempotency-Key', key).send(body);
    assert.equal(replay.status, first.status);
    assert.equal(replay.headers['idempotent-replayed'], 'true');

    const vitals = await prisma.vitalSign.findMany({ where: { patientId: patient.id } });
    assert.equal(vitals.length, 2, 'the replay must not record the measurements twice');
    assert.ok(vitals.every((vital) => vital.recordedAt.toISOString() === measuredAt), 'measurements keep the time they were taken');

    // The same key cannot be reused for a different entry.
    await request(server).post(`/api/patients/${patient.id}/vital-signs`).set('Cookie', cookies).set('Idempotency-Key', key)
      .send({ ...body, temperature: '36.9' }).expect(422);
    // A measurement claimed to be in the future is refused.
    await request(server).post(`/api/patients/${patient.id}/vital-signs`).set('Cookie', cookies).set('Idempotency-Key', randomUUID())
      .send({ temperature: '37', measuredAt: new Date(Date.now() + 3_600_000).toISOString() }).expect(400);
    // A refused request is not stored, so a corrected entry can be sent with a new key.
    assert.equal(await prisma.idempotencyRecord.count({ where: { userId: nurse.id } }), 1);
  } finally {
    if (app) await app.close();
    if (nurseId) await prisma.idempotencyRecord.deleteMany({ where: { userId: nurseId } }).catch(() => undefined);
    await prisma.session.deleteMany({ where: { user: { email: { contains: suffix } } } }).catch(() => undefined);
    await prisma.loginAttempt.deleteMany({ where: { username: { contains: suffix } } }).catch(() => undefined);
    if (clinicId) {
      await prisma.vitalSign.deleteMany({ where: { patient: { clinicId } } }).catch(() => undefined);
      await prisma.patient.deleteMany({ where: { clinicId } }).catch(() => undefined);
      await prisma.user.deleteMany({ where: { clinicId } }).catch(() => undefined);
      await prisma.clinic.deleteMany({ where: { id: clinicId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  }
});
