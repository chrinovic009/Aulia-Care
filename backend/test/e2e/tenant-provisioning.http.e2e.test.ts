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
  // An account opened by someone else only reaches the password-change screen
  // until its holder chooses their own password.
  const ownPassword = 'Kolwezi-Lualaba-48-Soins';
  // Sign-in and password-change routes are rate limited (5 per minute): only
  // the first account exercises the refusals.
  const firstLogin = async (server: Parameters<typeof request>[0], identifier: string, checkRefusals = false) => {
    const response = await request(server).post('/api/auth/login').send({ identifier, password }).expect(200);
    assert.equal(response.body.user.mustChangePassword, true);
    const cookies = response.headers['set-cookie'] as unknown as string[];
    const blocked = await request(server).get('/api/users').set('Cookie', cookies).expect(403);
    assert.equal(blocked.body.code, 'PASSWORD_CHANGE_REQUIRED');
    if (checkRefusals) {
      await request(server).post('/api/auth/change-password').set('Cookie', cookies).send({ currentPassword: 'wrong-password-1', newPassword: ownPassword }).expect(400);
      await request(server).post('/api/auth/change-password').set('Cookie', cookies).send({ currentPassword: password, newPassword: 'court1' }).expect(400);
    }
    await request(server).post('/api/auth/change-password').set('Cookie', cookies).send({ currentPassword: password, newPassword: ownPassword }).expect(200);
    const me = await request(server).get('/api/auth/me').set('Cookie', cookies).expect(200);
    assert.equal(me.body.mustChangePassword, false);
    if (checkRefusals) await request(server).post('/api/auth/login').send({ identifier, password }).expect(401);
    return cookies;
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
      .send({ layers: ['CORE'] })
      .expect(200);
    const createdSuperAdmin = await request(server)
      .post(`/api/platform/provisioning/clinics/${clinicId}/super-admin`)
      .set('Cookie', devCookies)
      .send({ firstName: 'Super', lastName: 'Admin', email: `super-${suffix}@clinic.local`, username: `super-${suffix}`, password })
      .expect(201);
    assert.equal(createdSuperAdmin.body.clinicId, clinicId);
    await request(server).post(`/api/platform/provisioning/clinics/${clinicId}/activate`).set('Cookie', devCookies).send({}).expect(201);

    const superCookies = await firstLogin(server, `super-${suffix}`, true);
    const createdAdmin = await request(server)
      .post('/api/users/super-admin/admins')
      .set('Cookie', superCookies)
      .send({ primaryRole: 'ADMIN', firstName: 'Admin', lastName: 'Local', displayName: 'Admin Local', email: `admin-${suffix}@clinic.local`, username: `admin-${suffix}`, password })
      .expect(201);
    assert.equal(createdAdmin.body.clinicId, clinicId);

    const adminCookies = await firstLogin(server, `admin-${suffix}`);
    const createdNurse = await request(server)
      .post('/api/users')
      .set('Cookie', adminCookies)
      .send({ primaryRole: 'NURSE', firstName: 'Nurse', lastName: 'Local', displayName: 'Nurse Local', email: `nurse-${suffix}@clinic.local`, username: `nurse-${suffix}`, password, shiftPattern: 'MANUAL' })
      .expect(201);
    const nurse = await prisma.user.findUniqueOrThrow({ where: { id: createdNurse.body.id }, include: { Employee: true } });
    assert.equal(nurse.mustChangePassword, true);
    const reset = await request(server).post(`/api/users/${nurse.id}/reset-password`).set('Cookie', adminCookies).send({}).expect(201);
    assert.match(reset.body.generatedPassword, /^[A-Za-z2-9]{4}-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}$/);
    const nurseLogin = await request(server).post('/api/auth/login').send({ identifier: `nurse-${suffix}`, password: reset.body.generatedPassword }).expect(200);
    assert.equal(nurseLogin.body.user.mustChangePassword, true);
    assert.equal(nurse.clinicId, clinicId);
    assert.equal(nurse.Employee[0]?.clinicId, clinicId);
  } finally {
    if (app) await app.close();
    if (clinicId) {
      await prisma.employee.deleteMany({ where: { clinicId } }).catch(() => undefined);
      await prisma.session.deleteMany({ where: { user: { clinicId } } }).catch(() => undefined);
      await prisma.passwordHistory.deleteMany({ where: { user: { clinicId } } }).catch(() => undefined);
      await prisma.user.deleteMany({ where: { clinicId } }).catch(() => undefined);
      await prisma.platformLayerConfiguration.deleteMany({ where: { clinicId } }).catch(() => undefined);
      await prisma.clinic.deleteMany({ where: { id: clinicId } }).catch(() => undefined);
    }
    await prisma.user.deleteMany({ where: { id: { not: '' }, email: `dev-${suffix}@platform.local` } }).catch(() => undefined);
    await prisma.$disconnect();
  }
});
