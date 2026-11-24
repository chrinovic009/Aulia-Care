import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { PrismaClient, RoleSlug } from '@prisma/client';
import { lastValueFrom, of } from 'rxjs';
import { OffDutyReadOnlyInterceptor, OffDutyService } from '../../src/users/off-duty.service';
import { UsersService } from '../../src/users/users.service';

const databaseUrl = process.env.TEST_DATABASE_URL;

test('PostgreSQL : après un départ validé, la session passe en lecture seule jusqu’au prochain poste', { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const users = new UsersService(prisma as never);
  const suffix = randomUUID().slice(0, 10);
  let clinicId: string | undefined;
  try {
    const clinic = await prisma.clinic.create({ data: { name: `Relève ${suffix}`, timezone: 'Africa/Lubumbashi' } });
    clinicId = clinic.id;
    const nurse = await prisma.user.create({ data: { clinicId: clinic.id, primaryRole: RoleSlug.NURSE, email: `n-${suffix}@e2e.local`, username: `n-${suffix}`, displayName: 'n', firstName: 'n', lastName: 'E2E', passwordHash: 'x' } });
    const employee = await prisma.employee.create({ data: { clinicId: clinic.id, userId: nurse.id, firstName: 'n', lastName: 'E2E', shiftPattern: 'MANUAL' } });
    const offDuty = new OffDutyService(prisma as never, users);
    const interceptor = new OffDutyReadOnlyInterceptor(offDuty);
    const call = async (method: string, url: string) => lastValueFrom(await interceptor.intercept(
      { getType: () => 'http', switchToHttp: () => ({ getRequest: () => ({ method, originalUrl: url, user: { userId: nurse.id } }) }) } as never,
      { handle: () => of('written') },
    ));

    // On duty: the shift is open, writing is allowed.
    const open = await prisma.attendance.create({ data: { employeeId: employee.id, clockInAt: new Date(Date.now() - 8 * 3_600_000), status: 'PRESENT' } });
    assert.equal((await offDuty.workMode(nurse.id)).readOnly, false);

    // Departure validated one hour ago: reading only.
    await prisma.attendance.update({ where: { id: open.id }, data: { clockOutAt: new Date(Date.now() - 3_600_000), handoverState: 'COMPLETED' } });
    offDuty.forget(nurse.id);
    assert.equal((await offDuty.workMode(nurse.id)).readOnly, true);
    await assert.rejects(() => call('POST', '/api/patients'), ForbiddenException);
    assert.equal(await call('GET', '/api/patients'), 'written', 'la lecture reste possible');
    assert.equal(await call('POST', '/api/auth/logout'), 'written', 'se déconnecter reste possible');
    // Opening a screen does not reopen the shift just left.
    assert.deepEqual(Object.keys(await offDuty.clockIn(nurse.id)).includes('readOnly'), true);
    assert.equal(await prisma.attendance.count({ where: { employeeId: employee.id, clockOutAt: null } }), 0);

    // The next day (more than 14 h later), the next arrival reopens writing.
    await prisma.attendance.update({ where: { id: open.id }, data: { clockOutAt: new Date(Date.now() - 15 * 3_600_000) } });
    offDuty.forget(nurse.id);
    assert.equal((await offDuty.workMode(nurse.id)).readOnly, false);

    // Administrators are never put off duty.
    const admin = await prisma.user.create({ data: { clinicId: clinic.id, primaryRole: RoleSlug.ADMIN, email: `a-${suffix}@e2e.local`, username: `a-${suffix}`, displayName: 'a', firstName: 'a', lastName: 'E2E', passwordHash: 'x' } });
    assert.equal((await offDuty.workMode(admin.id)).readOnly, false);
  } finally {
    if (clinicId) {
      await prisma.attendance.deleteMany({ where: { employee: { clinicId } } }).catch(() => undefined);
      await prisma.employee.deleteMany({ where: { clinicId } }).catch(() => undefined);
      await prisma.user.deleteMany({ where: { clinicId } }).catch(() => undefined);
      await prisma.clinic.delete({ where: { id: clinicId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  }
});
