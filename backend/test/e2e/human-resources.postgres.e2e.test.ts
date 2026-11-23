import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaClient, RoleSlug } from '@prisma/client';
import { ClinicContextService } from '../../src/core/clinic-context.service';
import { HrAccess } from '../../src/hr/hr-access';
import { HrAttendanceService } from '../../src/hr/hr-attendance.service';
import { HrContractsService } from '../../src/hr/hr-contracts.service';
import { HrLeaveService } from '../../src/hr/hr-leave.service';
import { HrPayrollService } from '../../src/hr/hr-payroll.service';
import { HrPolicyService } from '../../src/hr/hr-policy.service';

const databaseUrl = process.env.TEST_DATABASE_URL;

test('PostgreSQL RH : contrats, salaire modifiable, retards en heures, congés, remplacement et paie ajustée au paiement', { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const notifications = { createAndEmit: async () => ({}) };
  const access = new HrAccess(prisma as never, new ClinicContextService(prisma as never), notifications as never);
  const attendance = new HrAttendanceService(prisma as never, access);
  const payroll = new HrPayrollService(prisma as never, access, attendance);
  const leave = new HrLeaveService(prisma as never, access, attendance, payroll);
  const contracts = new HrContractsService(prisma as never, access);
  const policy = new HrPolicyService(prisma as never, access);
  const suffix = randomUUID().slice(0, 10);
  let clinicId: string | undefined;
  try {
    const clinic = await prisma.clinic.create({ data: { name: `RH ${suffix}`, timezone: 'Africa/Lubumbashi' } });
    clinicId = clinic.id;
    const person = async (key: string, primaryRole: RoleSlug, withEmployee = true) => {
      const user = await prisma.user.create({ data: { clinicId: clinic.id, primaryRole, email: `${key}-${suffix}@e2e.local`, username: `${key}-${suffix}`, displayName: key, firstName: key, lastName: 'E2E', passwordHash: 'not-used' } });
      const employee = withEmployee ? await prisma.employee.create({ data: { clinicId: clinic.id, userId: user.id, firstName: key, lastName: 'E2E', hireDate: new Date('2025-01-01T00:00:00Z'), shiftPattern: 'MANUAL' } }) : null;
      return { user, employee, actor: { userId: user.id } };
    };
    const admin = await person('admin', RoleSlug.ADMIN);
    const finance = await person('finance', RoleSlug.FINANCE);
    const superAdmin = await person('super', RoleSlug.SUPER_ADMIN, false);
    const nurse = await person('nurse', RoleSlug.NURSE);
    const colleague = await person('colleague', RoleSlug.NURSE);

    // Rules: pay due on the 5th, 5 min tolerance, 200 h / 25 days per month.
    await policy.update({ payDay: 5, lateGraceMinutes: 5, monthlyWorkingHours: 200, workingDaysPerMonth: 25, leaveDaysPerMonth: 1, seniorityBonusYears: 5, workWeekDays: [1, 2, 3, 4, 5, 6] }, finance.actor);
    await assert.rejects(() => policy.update({ payDay: 5 }, nurse.actor), ForbiddenException);

    // Contract, then a salary change in the middle of October: history kept, October paid pro rata.
    await contracts.create(nurse.employee!.id, { type: 'PERMANENT', startDate: '2025-01-01', salary: 1000, currency: 'USD', reason: 'Embauche' }, admin.actor);
    await assert.rejects(() => contracts.changeSalary(nurse.employee!.id, { salary: 1200, effectiveDate: '2026-10-16' }, finance.actor), BadRequestException);
    await contracts.changeSalary(nurse.employee!.id, { salary: 1200, effectiveDate: '2026-10-16', reason: 'Promotion' }, finance.actor);
    const history = await contracts.history(nurse.employee!.id, superAdmin.actor);
    assert.deepEqual(history.map((row) => [row.salary, row.startDate, row.endDate, row.active]), [[1200, '2026-10-16', null, true], [1000, '2025-01-01', '2026-10-15', false]]);
    await assert.rejects(() => contracts.changeSalary(nurse.employee!.id, { salary: 1, effectiveDate: '2026-10-20', reason: 'x' }, nurse.actor), ForbiddenException);

    // A 3 h 46 min lateness on a planned shift, and a planned shift without any clock-in (absence).
    const shift = await prisma.shift.create({ data: { employeeId: nurse.employee!.id, startAt: new Date('2026-10-05T05:30:00Z'), endAt: new Date('2026-10-05T15:30:00Z'), type: 'DAY' } });
    await prisma.attendance.create({ data: { employeeId: nurse.employee!.id, shiftId: shift.id, plannedStartAt: shift.startAt, plannedEndAt: shift.endAt, clockInAt: new Date('2026-10-05T09:16:00Z'), clockOutAt: new Date('2026-10-05T15:30:00Z'), status: 'LATE' } });
    await prisma.shift.create({ data: { employeeId: nurse.employee!.id, startAt: new Date('2026-10-06T05:30:00Z'), endAt: new Date('2026-10-06T15:30:00Z'), type: 'DAY' } });
    const report = await attendance.report('2026-10', admin.actor);
    const row = report.rows.find((item) => item.employee.id === nurse.employee!.id)!;
    assert.equal(row.lateDuration, '3 h 46 min');
    assert.equal(row.absentDays, 1);
    assert.equal(report.biggestLate[0].duration, '3 h 46 min');
    await assert.rejects(() => attendance.report('2026-10', nurse.actor), ForbiddenException);

    // October payroll: gross pro rata of both salaries, lateness and absence proposed as deductions.
    await assert.rejects(() => payroll.generate('2026-10', admin.actor), ForbiddenException);
    const generated = await payroll.generate('2026-10', finance.actor);
    assert.equal(generated.created, 1);
    const october = await payroll.list('2026-10', admin.actor);
    const pay = october.payrolls.find((item) => item.employeeId === nurse.employee!.id)!;
    assert.equal(pay.gross, Math.round(((1000 * 15 + 1200 * 16) / 31) * 100) / 100);
    assert.deepEqual(pay.proposedLines.map((line) => line.kind), ['LATE', 'ABSENCE']);
    assert.match(pay.proposedLines[0].label, /3 h 46 min/);
    assert.equal(pay.state, 'LATE', 'octobre non payé après le 5 novembre');
    assert.equal(october.canManage, false);
    assert.ok((await payroll.overview(superAdmin.actor)).late.some((item) => item.id === pay.id));

    // The absence is justified by the administration: the recomputed proposal no longer deducts it.
    await attendance.recordAbsence({ employeeId: nurse.employee!.id, date: '2026-10-06', justified: true, note: 'Certificat médical' }, admin.actor);
    const refreshed = await payroll.recompute(pay.id, finance.actor);
    assert.deepEqual(refreshed.proposedLines.map((line) => line.kind), ['LATE']);

    // Payment: changing the proposal needs a reason; the adjustment only concerns this month.
    const lines = [{ kind: 'LATE', label: 'Retards (réduit)', amount: -5 }, { kind: 'BONUS', label: 'Prime de garde', amount: 50 }];
    await assert.rejects(() => payroll.pay(pay.id, { version: refreshed.version, lines }, finance.actor), BadRequestException);
    await assert.rejects(() => payroll.pay(pay.id, { version: refreshed.version, lines, notes: 'x' }, admin.actor), ForbiddenException);
    await assert.rejects(() => payroll.pay(pay.id, { version: refreshed.version - 1, lines, notes: 'x' }, finance.actor), ConflictException);
    const paid = await payroll.pay(pay.id, { version: refreshed.version, lines, notes: 'Retard en partie justifié ; prime de garde de nuit', paymentMethod: 'Virement' }, finance.actor);
    assert.equal(paid.state, 'PAID');
    assert.equal(paid.net, Math.round((refreshed.gross - 5 + 50) * 100) / 100);
    await assert.rejects(() => payroll.pay(pay.id, { version: paid.version, lines, notes: 'x' }, finance.actor), ConflictException);
    // A later salary change never alters the paid month.
    await contracts.changeSalary(nurse.employee!.id, { salary: 1500, effectiveDate: '2026-11-01', reason: 'Révision' }, admin.actor);
    assert.equal((await payroll.generate('2026-10', finance.actor)).skipped, 1);
    assert.equal((await prisma.payroll.findUniqueOrThrow({ where: { id: pay.id } })).netAmount.toNumber(), paid.net);

    // Leave from the employee's own space, with a colleague proposed as replacement.
    const space = await leave.mySpace(nurse.actor);
    assert.ok(space.balance.acquired >= 10);
    assert.ok(space.payslips.some((slip) => slip.id === pay.id));
    await assert.rejects(() => leave.requestLeave({ type: 'BEREAVEMENT', startDate: '2026-12-01', endDate: '2026-12-03' }, nurse.actor), BadRequestException);
    const bereavement = await leave.requestLeave({ type: 'BEREAVEMENT', startDate: '2026-12-01', endDate: '2026-12-03', reason: 'Décès de mon père', replacementEmployeeId: colleague.employee!.id }, nurse.actor);
    assert.equal(bereavement.days, 3);
    assert.equal(bereavement.deductsBalance, false);
    await assert.rejects(() => leave.requestLeave({ type: 'ANNUAL', startDate: '2026-12-02', endDate: '2026-12-04' }, nurse.actor), ConflictException);
    const asked = (await leave.mySpace(colleague.actor)).replacementsAskedOfMe;
    assert.equal(asked.length, 1);
    await assert.rejects(() => leave.decideLeave(bereavement.id, { decision: 'REJECT' }, admin.actor), BadRequestException);
    await assert.rejects(() => leave.decideLeave(bereavement.id, { decision: 'APPROVE' }, finance.actor), ForbiddenException);
    await leave.decideLeave(bereavement.id, { decision: 'APPROVE' }, admin.actor);
    await assert.rejects(() => leave.decideReplacement(asked[0].id, { decision: 'APPROVE' }, admin.actor), ConflictException);
    await leave.respondReplacement(asked[0].id, { accept: true }, colleague.actor);
    const approved = await leave.decideReplacement(asked[0].id, { decision: 'APPROVE' }, admin.actor);
    assert.equal(approved.status, 'APPROVED');
    assert.equal(await prisma.shift.count({ where: { employeeId: colleague.employee!.id } }), 1);

    // Annual leave beyond the balance is only granted knowingly.
    const tooLong = await leave.requestLeave({ type: 'ANNUAL', startDate: '2027-01-04', endDate: '2027-02-27' }, nurse.actor);
    await assert.rejects(() => leave.decideLeave(tooLong.id, { decision: 'APPROVE' }, admin.actor), /Solde insuffisant/);
    await leave.decideLeave(tooLong.id, { decision: 'APPROVE', force: true }, admin.actor);
    // An administrator cannot decide their own leave.
    const own = await leave.requestLeave({ type: 'SICK', startDate: '2026-12-10', endDate: '2026-12-10', reason: 'Fièvre' }, admin.actor);
    await assert.rejects(() => leave.decideLeave(own.id, { decision: 'APPROVE' }, admin.actor), ForbiddenException);
  } finally {
    if (clinicId) {
      const employee = { clinicId };
      await prisma.replacementRequest.deleteMany({ where: { clinicId } }).catch(() => undefined);
      await prisma.payroll.deleteMany({ where: { employee } }).catch(() => undefined);
      await prisma.attendance.deleteMany({ where: { employee } }).catch(() => undefined);
      await prisma.shift.deleteMany({ where: { employee } }).catch(() => undefined);
      await prisma.leaveRequest.deleteMany({ where: { employee } }).catch(() => undefined);
      await prisma.employeeContract.deleteMany({ where: { employee } }).catch(() => undefined);
      await prisma.employee.deleteMany({ where: employee }).catch(() => undefined);
      await prisma.hrPolicy.deleteMany({ where: { clinicId } }).catch(() => undefined);
      await prisma.auditTrail.deleteMany({ where: { actor: { clinicId } } }).catch(() => undefined);
      await prisma.user.deleteMany({ where: { clinicId } }).catch(() => undefined);
      await prisma.clinic.delete({ where: { id: clinicId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  }
});
