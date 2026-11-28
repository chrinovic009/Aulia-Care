import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { PrismaClient, RoleSlug } from '@prisma/client';
import { ClinicContextService } from '../../src/core/clinic-context.service';
import { NavigationBadgesService } from '../../src/navigation/navigation-badges.service';
import { DailyReportsService } from '../../src/reports/daily-reports.service';

const databaseUrl = process.env.TEST_DATABASE_URL;

test('PostgreSQL : rapports quotidiens archivés par service, paginés, par période ; compteurs du menu', { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const context = new ClinicContextService(prisma as never);
  const reports = new DailyReportsService(prisma as never, context);
  const suffix = randomUUID().slice(0, 10);
  let clinicId: string | undefined;
  try {
    const clinic = await prisma.clinic.create({ data: { name: `Rapports ${suffix}`, timezone: 'Africa/Lubumbashi' } });
    clinicId = clinic.id;
    const user = (key: string, primaryRole: RoleSlug) => prisma.user.create({ data: { clinicId: clinic.id, primaryRole, email: `${key}-${suffix}@e2e.local`, username: `${key}-${suffix}`, displayName: key, firstName: key, lastName: 'E2E', passwordHash: 'not-used' } });
    const [admin, nurse] = await Promise.all([user('admin', RoleSlug.ADMIN), user('nurse', RoleSlug.NURSE)]);
    // Two patients registered on 2026-11-20 (Lubumbashi time), one on the 21st.
    await prisma.patient.createMany({ data: [
      { clinicId: clinic.id, firstName: 'A', lastName: suffix, gender: 'OTHER', dateOfBirth: new Date('1990-01-01'), createdAt: new Date('2026-11-20T08:00:00Z') },
      { clinicId: clinic.id, firstName: 'B', lastName: suffix, gender: 'OTHER', dateOfBirth: new Date('1990-01-01'), createdAt: new Date('2026-11-20T21:30:00Z') },
      { clinicId: clinic.id, firstName: 'C', lastName: suffix, gender: 'OTHER', dateOfBirth: new Date('1990-01-01'), createdAt: new Date('2026-11-20T22:30:00Z') },
    ] });
    await reports.archive(clinic.id, '2026-11-20');
    await reports.archive(clinic.id, '2026-11-21');
    const reception = (await prisma.dailyReport.findUniqueOrThrow({ where: { clinicId_service_day: { clinicId: clinic.id, service: 'RECEPTION', day: '2026-11-20' } } })).data as { metrics: Array<{ key: string; value: number }> };
    assert.equal(reception.metrics.find((metric) => metric.key === 'patients')?.value, 2, '23h30 à Lubumbashi compte encore pour le 20');
    assert.equal(await prisma.dailyReport.count({ where: { clinicId: clinic.id, day: '2026-11-20' } }), 10, 'un rapport par service');

    const page = await reports.list('RECEPTION', 1, 1, { userId: admin.id });
    assert.equal(page.reports[0].live, true, 'la journée en cours est calculée en direct en tête de page 1');
    assert.equal(page.reports[1].day, '2026-11-21');
    assert.equal(page.pages, 2);
    assert.equal((await reports.list('RECEPTION', 2, 1, { userId: admin.id })).reports[0].day, '2026-11-20');
    const period = await reports.period('RECEPTION', '2026-11-20', '2026-11-21', { userId: admin.id });
    assert.equal(period.totals.find((metric) => metric.key === 'patients')?.value, 3);
    assert.equal(period.series.length, 2);
    await assert.rejects(() => reports.list('RECEPTION', 1, 7, { userId: nurse.id }), ForbiddenException);

    // Menu counters: patients waiting for the nurse's vital signs.
    await prisma.patient.updateMany({ where: { clinicId: clinic.id, firstName: 'A' }, data: { workflowStatus: 'EN_ATTENTE_INFIRMERIE' } });
    const badges = new NavigationBadgesService(prisma as never, context, { findUnread: async () => [] } as never);
    const counters = await badges.badges({ userId: nurse.id });
    assert.equal(counters.nursePatients?.count, 1);
    assert.equal(counters.messages, undefined, 'aucun compteur à zéro');
  } finally {
    if (clinicId) {
      await prisma.dailyReport.deleteMany({ where: { clinicId } }).catch(() => undefined);
      await prisma.patient.deleteMany({ where: { clinicId } }).catch(() => undefined);
      await prisma.user.deleteMany({ where: { clinicId } }).catch(() => undefined);
      await prisma.clinic.delete({ where: { id: clinicId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  }
});
