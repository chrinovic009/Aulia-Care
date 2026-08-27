import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import * as bcrypt from 'bcrypt';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../../src/app.module';

const databaseUrl = process.env.TEST_DATABASE_URL;

/**
 * This is deliberately an HTTP test: it exercises Nest routing, JWT session
 * verification, role guards and tenant scoping. It is skipped unless an
 * explicitly configured disposable PostgreSQL database is available.
 */
test('HTTP E2E: une réception ne lit jamais le dossier d’un autre établissement', { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const suffix = randomUUID().slice(0, 12);
  const password = 'E2E-Strong-Password-2026!';
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  let app: INestApplication | undefined;
  let clinicAId: string | undefined;
  let clinicBId: string | undefined;

  try {
    // AppModule's Prisma instance reads DATABASE_URL, while this test client
    // reads TEST_DATABASE_URL. CI intentionally points both to its disposable
    // aulia_core_ci database.
    process.env.DATABASE_URL = databaseUrl;
    process.env.JWT_SECRET ??= 'http_e2e_access_secret';
    process.env.JWT_REFRESH_SECRET ??= 'http_e2e_refresh_secret';
    process.env.CORS_ORIGIN ??= 'http://localhost:5173';

    const [clinicA, clinicB] = await Promise.all([
      prisma.clinic.create({ data: { name: `HTTP E2E A ${suffix}` } }),
      prisma.clinic.create({ data: { name: `HTTP E2E B ${suffix}` } }),
    ]);
    clinicAId = clinicA.id;
    clinicBId = clinicB.id;
    const passwordHash = await bcrypt.hash(password, 10);
    const [receptionA, receptionB] = await Promise.all([
      prisma.user.create({ data: { clinicId: clinicA.id, email: `reception-a-${suffix}@e2e.local`, username: `reception-a-${suffix}`, displayName: 'Réception A E2E', firstName: 'Réception', lastName: 'A', passwordHash, primaryRole: 'RECEPTIONIST' } }),
      prisma.user.create({ data: { clinicId: clinicB.id, email: `reception-b-${suffix}@e2e.local`, username: `reception-b-${suffix}`, displayName: 'Réception B E2E', firstName: 'Réception', lastName: 'B', passwordHash, primaryRole: 'RECEPTIONIST' } }),
    ]);
    const [patientA, patientB] = await Promise.all([
      prisma.patient.create({ data: { clinicId: clinicA.id, receptionistId: receptionA.id, firstName: 'Patient', lastName: `HTTP-A-${suffix}`, gender: 'OTHER', dateOfBirth: new Date('1990-01-01T00:00:00.000Z') } }),
      prisma.patient.create({ data: { clinicId: clinicB.id, receptionistId: receptionB.id, firstName: 'Patient', lastName: `HTTP-B-${suffix}`, gender: 'OTHER', dateOfBirth: new Date('1990-01-01T00:00:00.000Z') } }),
    ]);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ identifier: receptionA.username, password })
      .expect(200);
    const cookies = login.headers['set-cookie'];
    assert.ok(Array.isArray(cookies) && cookies.some((cookie: string) => cookie.startsWith('aulia_access_token=')));

    await request(app.getHttpServer())
      .get(`/api/patients/${patientA.id}`)
      .set('Cookie', cookies)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/api/patients/${patientB.id}`)
      .set('Cookie', cookies)
      .expect(404);

    const visiblePatients = await request(app.getHttpServer())
      .get('/api/patients?page=1&limit=10')
      .set('Cookie', cookies)
      .expect(200);
    const values = Array.isArray(visiblePatients.body) ? visiblePatients.body : visiblePatients.body.items;
    assert.ok(values.some((patient: { id: string }) => patient.id === patientA.id));
    assert.ok(!values.some((patient: { id: string }) => patient.id === patientB.id));
  } finally {
    if (app) await app.close();
    await prisma.session.deleteMany({ where: { user: { email: { contains: suffix } } } }).catch(() => undefined);
    await prisma.loginAttempt.deleteMany({ where: { username: { contains: suffix } } }).catch(() => undefined);
    if (clinicAId || clinicBId) {
      await prisma.patient.deleteMany({ where: { clinicId: { in: [clinicAId, clinicBId].filter((id): id is string => Boolean(id)) } } }).catch(() => undefined);
      await prisma.user.deleteMany({ where: { clinicId: { in: [clinicAId, clinicBId].filter((id): id is string => Boolean(id)) } } }).catch(() => undefined);
      await prisma.clinic.deleteMany({ where: { id: { in: [clinicAId, clinicBId].filter((id): id is string => Boolean(id)) } } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  }
});
