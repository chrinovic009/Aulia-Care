import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import * as bcrypt from 'bcrypt';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient, RoleSlug } from '@prisma/client';
import { AppModule } from '../../src/app.module';

const databaseUrl = process.env.TEST_DATABASE_URL;

/** The institutional chain is deliberately exercised through HTTP instead of
 * calling services directly: guards, current-user resolution and role policy
 * must all participate. */
test('HTTP E2E: DEV -> clinic -> layers -> Super Admin -> Admin -> staff preserves one tenant', { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const suffix = randomUUID().slice(0, 12);
  const password = 'Provisioning-Strong-Password-2026!';
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  let app: INestApplication | undefined;
  let clinicId: string | undefined;

  const login = async (server: Parameters<typeof request>[0], identifier: string) => {
    const response = await request(server).post('/api/auth/login').send({ identifier, password }).expect(200);
    const cookies = response.headers['set-cookie'];
    assert.ok(Array.isArray(cookies));
    return cookies as string[];
  };

  try {
    process.env.DATABASE_URL = databaseUrl;
    process.env.JWT_SECRET ??= 'tenant_provisioning_access_secret';
    process.env.JWT_REFRESH_SECRET ??= 'tenant_provisioning_refresh_secret';
    process.env.CORS_ORIGIN ??= 'http://localhost:5173';
    const dev = await prisma.user.create({
      data: {
        email: `dev-${suffix}@platform.local`, username: `dev-${suffix}`, displayName: 'DEV E2E',
        firstName: 'DEV', lastName: 'E2E', passwordHash: await bcrypt.hash(password, 10), primaryRole: RoleSlug.DEV,
      },
    });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    const server = app.getHttpServer();
    const devCookies = await login(server, dev.username);

    await request(server).get('/api/patients').set('Cookie', devCookies).expect(403);
    const createdClinic = await request(server)
      .post('/api/platform/provisioning/clinics')
      .set('Cookie', devCookies)
      .send({ name: `Clinic ${suffix}`, brandDisplayName: `Centre ${suffix}`, establishmentType: 'CLINIC', timezone: 'Africa/Lubumbashi', currency: 'CDF' })
      .expect(201);
    clinicId = createdClinic.body.id;
    assert.ok(clinicId);

    await request(server)
      .put(`/api/platform/provisioning/clinics/${clinicId}/layers`)
      .set('Cookie', devCookies)
      .send({ layers: ['CORE', 'AI'] })
      .expect(200);
    const createdSuperAdmin = await request(server)
      .post(`/api/platform/provisioning/clinics/${clinicId}/super-admin`)
      .set('Cookie', devCookies)
      .send({ firstName: 'Super', lastName: 'Admin', email: `super-${suffix}@clinic.local`, username: `super-${suffix}`, password })
      .expect(201);
    assert.equal(createdSuperAdmin.body.clinicId, clinicId);
    await request(server).post(`/api/platform/provisioning/clinics/${clinicId}/activate`).set('Cookie', devCookies).send({}).expect(201);

    const superCookies = await login(server, `super-${suffix}`);
    const createdAdmin = await request(server)
      .post('/api/users/super-admin/admins')
      .set('Cookie', superCookies)
      .send({ primaryRole: 'ADMIN', firstName: 'Admin', lastName: 'Local', displayName: 'Admin Local', email: `admin-${suffix}@clinic.local`, username: `admin-${suffix}`, password })
      .expect(201);
    assert.equal(createdAdmin.body.clinicId, clinicId);

    const adminCookies = await login(server, `admin-${suffix}`);
    const createdNurse = await request(server)
      .post('/api/users')
      .set('Cookie', adminCookies)
      .send({ primaryRole: 'NURSE', firstName: 'Nurse', lastName: 'Local', displayName: 'Nurse Local', email: `nurse-${suffix}@clinic.local`, username: `nurse-${suffix}`, password, shiftPattern: 'MANUAL' })
      .expect(201);
    const nurse = await prisma.user.findUniqueOrThrow({ where: { id: createdNurse.body.id }, include: { Employee: true } });
    assert.equal(nurse.clinicId, clinicId);
    assert.equal(nurse.Employee[0]?.clinicId, clinicId);
  } finally {
    if (app) await app.close();
    if (clinicId) {
      await prisma.employee.deleteMany({ where: { clinicId } }).catch(() => undefined);
      await prisma.session.deleteMany({ where: { user: { clinicId } } }).catch(() => undefined);
      await prisma.user.deleteMany({ where: { clinicId } }).catch(() => undefined);
      await prisma.platformLayerConfiguration.deleteMany({ where: { clinicId } }).catch(() => undefined);
      await prisma.clinic.deleteMany({ where: { id: clinicId } }).catch(() => undefined);
    }
    await prisma.user.deleteMany({ where: { id: { not: '' }, email: `dev-${suffix}@platform.local` } }).catch(() => undefined);
    await prisma.$disconnect();
  }
});
