import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import * as bcrypt from 'bcrypt';
import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { runWithRequestContext } from '../../src/core/request-context';
import { PrismaService } from '../../src/prisma/prisma.service';

const databaseUrl = process.env.TEST_DATABASE_URL;

test('PostgreSQL + HTTP : sessions, jetons et rôles restent propres à leur compte sans bloquer l’authentification', { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  process.env.DATABASE_URL = databaseUrl;
  process.env.JWT_SECRET = 'identity_rls_access_secret';
  process.env.JWT_REFRESH_SECRET = 'identity_rls_refresh_secret';
  process.env.CORS_ORIGIN = 'http://localhost:5173';

  const suffix = randomUUID().slice(0, 12);
  const password = 'Identity-E2E-2026!';
  const passwordHash = await bcrypt.hash(password, 10);
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  let app: INestApplication | undefined;
  let scoped: PrismaService | undefined;
  let clinicAId = '';
  let clinicBId = '';

  try {
    const [clinicA, clinicB] = await Promise.all([
      prisma.clinic.create({ data: { name: `Identité A ${suffix}` } }),
      prisma.clinic.create({ data: { name: `Identité B ${suffix}` } }),
    ]);
    clinicAId = clinicA.id;
    clinicBId = clinicB.id;
    const userData = (clinicId: string, tag: string, primaryRole: 'PHYSICIAN' | 'ADMIN') => ({
      clinicId, primaryRole, email: `${tag}-${suffix}@e2e.local`, username: `${tag}-${suffix}`,
      displayName: tag, firstName: tag, lastName: suffix, passwordHash,
    });
    const [userA, userB, adminA] = await Promise.all([
      prisma.user.create({ data: userData(clinicA.id, 'identite-a', 'PHYSICIAN') }),
      prisma.user.create({ data: userData(clinicB.id, 'identite-b', 'PHYSICIAN') }),
      prisma.user.create({ data: userData(clinicA.id, 'identite-admin', 'ADMIN') }),
    ]);
    const role = await prisma.role.upsert({
      where: { slug: 'MEDICAL_DIRECTOR' }, update: {},
      create: { slug: 'MEDICAL_DIRECTOR', name: 'Médecin directeur E2E' },
    });
    const [roleA, roleB] = await Promise.all([
      prisma.userRole.create({ data: { userId: userA.id, roleId: role.id } }),
      prisma.userRole.create({ data: { userId: userB.id, roleId: role.id } }),
    ]);
    const [sessionA, sessionB] = await Promise.all([
      prisma.session.create({ data: { userId: userA.id, tokenHash: `sha256:${'a'.repeat(64)}`, expiresAt: new Date(Date.now() + 3600_000) } }),
      prisma.session.create({ data: { userId: userB.id, tokenHash: `sha256:${'b'.repeat(64)}`, expiresAt: new Date(Date.now() + 3600_000) } }),
    ]);
    const [historyA, historyB] = await Promise.all([
      prisma.sessionRefreshTokenHistory.create({ data: { sessionId: sessionA.id, tokenHash: `sha256:${'c'.repeat(64)}` } }),
      prisma.sessionRefreshTokenHistory.create({ data: { sessionId: sessionB.id, tokenHash: `sha256:${'d'.repeat(64)}` } }),
    ]);
    const [refreshA, refreshB] = await Promise.all([
      prisma.refreshToken.create({ data: { userId: userA.id, tokenHash: 'a', expiresAt: new Date(Date.now() + 3600_000) } }),
      prisma.refreshToken.create({ data: { userId: userB.id, tokenHash: 'b', expiresAt: new Date(Date.now() + 3600_000) } }),
    ]);
    const [passwordA, passwordB] = await Promise.all([
      prisma.passwordHistory.create({ data: { userId: userA.id, passwordHash: 'a' } }),
      prisma.passwordHistory.create({ data: { userId: userB.id, passwordHash: 'b' } }),
    ]);
    const [resetA, resetB] = await Promise.all([
      prisma.passwordResetToken.create({ data: { userId: userA.id, tokenHash: 'a', expiresAt: new Date(Date.now() + 3600_000) } }),
      prisma.passwordResetToken.create({ data: { userId: userB.id, tokenHash: 'b', expiresAt: new Date(Date.now() + 3600_000) } }),
    ]);
    const [attemptA, attemptB] = await Promise.all([
      prisma.loginAttempt.create({ data: { userId: userA.id, username: userA.username, result: 'SUCCESS' } }),
      prisma.loginAttempt.create({ data: { userId: userB.id, username: userB.username, result: 'SUCCESS' } }),
    ]);
    const [auditA, auditB] = await Promise.all([
      prisma.auditTrail.create({ data: { actorId: userA.id, entity: 'USER', entityId: userA.id, action: 'UPDATE' } }),
      prisma.auditTrail.create({ data: { actorId: userB.id, entity: 'USER', entityId: userB.id, action: 'UPDATE' } }),
    ]);

    scoped = new PrismaService();
    await scoped.onModuleInit();
    const asA = <T>(work: () => Promise<T>) => runWithRequestContext(
      { userId: userA.id, role: 'PHYSICIAN', roles: ['PHYSICIAN'], clinicId: clinicA.id, route: 'TEST identity RLS' }, async () => await work(),
    );
    assert.deepEqual((await asA(() => scoped!.session.findMany({ where: { id: { in: [sessionA.id, sessionB.id] } }, select: { id: true } }))).map(row => row.id), [sessionA.id], 'sessions');
    assert.deepEqual((await asA(() => scoped!.sessionRefreshTokenHistory.findMany({ where: { id: { in: [historyA.id, historyB.id] } }, select: { id: true } }))).map(row => row.id), [historyA.id], 'historique des jetons');
    assert.deepEqual((await asA(() => scoped!.refreshToken.findMany({ where: { id: { in: [refreshA.id, refreshB.id] } }, select: { id: true } }))).map(row => row.id), [refreshA.id], 'jetons de renouvellement');
    assert.deepEqual((await asA(() => scoped!.passwordHistory.findMany({ where: { id: { in: [passwordA.id, passwordB.id] } }, select: { id: true } }))).map(row => row.id), [passwordA.id], 'historique des mots de passe');
    assert.deepEqual((await asA(() => scoped!.passwordResetToken.findMany({ where: { id: { in: [resetA.id, resetB.id] } }, select: { id: true } }))).map(row => row.id), [resetA.id], 'jetons de réinitialisation');
    assert.deepEqual((await asA(() => scoped!.loginAttempt.findMany({ where: { id: { in: [attemptA.id, attemptB.id] } }, select: { id: true } }))).map(row => row.id), [attemptA.id], 'tentatives de connexion');
    assert.deepEqual((await asA(() => scoped!.auditTrail.findMany({ where: { id: { in: [auditA.id, auditB.id] } }, select: { id: true } }))).map(row => row.id), [auditA.id], 'journal de sécurité');
    assert.equal(await asA(() => scoped.userRole.count({ where: { id: roleB.id } })), 0);
    assert.equal(await asA(() => scoped.userRole.count({ where: { id: roleA.id } })), 1);
    assert.deepEqual(await asA(() => scoped.session.updateMany({ where: { id: sessionB.id }, data: { lastSeenAt: new Date() } })), { count: 0 });
    const adminContext = { userId: adminA.id, role: 'ADMIN', roles: ['ADMIN'], clinicId: clinicA.id, route: 'TEST admin revocation' } as const;
    const adminPermission = await runWithRequestContext(adminContext, async () => await scoped!.$transaction(async (tx) =>
      await tx.$queryRaw<Array<{ db_role: string; user_role: string; clinic_id: string; allowed: boolean }>>`SELECT current_user::text AS db_role, current_setting('app.user_role', true) AS user_role, current_setting('app.clinic_id', true) AS clinic_id, "aulia_identity_admin_for"(${userA.id}) AS allowed`,
    ));
    assert.deepEqual(adminPermission, [{ db_role: 'aulia_app', user_role: 'ADMIN', clinic_id: clinicA.id, allowed: true }]);
    assert.deepEqual(await runWithRequestContext(
      adminContext,
      async () => await scoped!.session.updateMany({ where: { id: sessionA.id }, data: { lastSeenAt: new Date() } }),
    ), { count: 1 });
    const publicAttempt = await runWithRequestContext(
      { userId: 'public-login', role: 'AUTH_LOGIN', route: 'TEST public login' },
      async () => await scoped!.loginAttempt.create({ data: { username: `public-${suffix}`, result: 'FAILURE' } }),
    );
    assert.ok(publicAttempt.id);
    assert.deepEqual(await scoped.$queryRaw`SELECT "table_name" FROM "aulia_unprotected_tenant_tables"()`, []);
    await scoped.$disconnect();

    const { AppModule } = await import('../../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();

    const login = await request(app.getHttpServer())
      .post('/api/auth/login').send({ identifier: userA.username, password }).expect(200);
    const loginCookies = login.headers['set-cookie'];
    assert.ok(Array.isArray(loginCookies));
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', loginCookies).expect(200);

    const refreshed = await request(app.getHttpServer())
      .post('/api/auth/refresh').set('Cookie', loginCookies).send({}).expect(200);
    const refreshedCookies = refreshed.headers['set-cookie'];
    assert.ok(Array.isArray(refreshedCookies));
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', refreshedCookies).expect(200);
    await request(app.getHttpServer()).post('/api/auth/logout').set('Cookie', refreshedCookies).expect(204);
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', refreshedCookies).expect(401);
  } finally {
    if (app) await app.close();
    if (scoped) await scoped.$disconnect().catch(() => undefined);
    const clinicIds = [clinicAId, clinicBId].filter(Boolean);
    await prisma.auditTrail.deleteMany({ where: { actor: { lastName: suffix } } }).catch(() => undefined);
    await prisma.loginAttempt.deleteMany({ where: { username: { endsWith: suffix } } }).catch(() => undefined);
    await prisma.sessionRefreshTokenHistory.deleteMany({ where: { session: { user: { lastName: suffix } } } }).catch(() => undefined);
    await prisma.session.deleteMany({ where: { user: { lastName: suffix } } }).catch(() => undefined);
    await prisma.refreshToken.deleteMany({ where: { user: { lastName: suffix } } }).catch(() => undefined);
    await prisma.passwordHistory.deleteMany({ where: { user: { lastName: suffix } } }).catch(() => undefined);
    await prisma.passwordResetToken.deleteMany({ where: { user: { lastName: suffix } } }).catch(() => undefined);
    await prisma.userRole.deleteMany({ where: { user: { lastName: suffix } } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { lastName: suffix } }).catch(() => undefined);
    if (clinicIds.length) await prisma.clinic.deleteMany({ where: { id: { in: clinicIds } } }).catch(() => undefined);
    await prisma.$disconnect();
  }
});
