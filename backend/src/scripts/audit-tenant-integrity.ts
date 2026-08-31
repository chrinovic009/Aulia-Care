import 'dotenv/config';
import { PrismaClient, RoleSlug } from '@prisma/client';

/**
 * Tenant integrity maintenance tool.
 *
 * Default mode is read-only. `--apply` repairs only deterministic legacy
 * mismatches: an Employee missing clinicId while its linked User has one, or
 * a User missing clinicId while exactly one linked Employee has one. It never
 * guesses a clinic for a fully detached account and never overwrites a
 * conflicting clinic id.
 */
const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');
const operationalRoles = Object.values(RoleSlug).filter((role) => role !== RoleSlug.DEV);

type Finding = { category: string; id: string; detail: Record<string, unknown>; repairable?: boolean };
const findings: Finding[] = [];
const report = (category: string, id: string, detail: Record<string, unknown>, repairable = false) => {
  findings.push({ category, id, detail, repairable });
};

async function audit() {
  const [users, employees, serviceUnits, roomAssignments, configurations] = await Promise.all([
    prisma.user.findMany({
      where: { deletedAt: null, primaryRole: { in: operationalRoles } },
      select: { id: true, username: true, primaryRole: true, clinicId: true, Employee: { select: { id: true, clinicId: true } } },
    }),
    prisma.employee.findMany({
      select: { id: true, userId: true, clinicId: true, user: { select: { id: true, clinicId: true, primaryRole: true } } },
    }),
    prisma.serviceUnit.findMany({
      where: { deletedAt: null },
      select: { id: true, clinicId: true, department: { select: { clinicId: true } } },
    }),
    prisma.roomStaffAssignment.findMany({
      where: { active: true },
      select: { id: true, user: { select: { clinicId: true } }, room: { select: { serviceUnit: { select: { clinicId: true } } } } },
    }),
    prisma.platformLayerConfiguration.findMany({ select: { id: true, clinicId: true } }),
  ]);

  for (const user of users) {
    if (user.clinicId) continue;
    const employeeClinics = [...new Set(user.Employee.map((employee) => employee.clinicId).filter((clinicId): clinicId is string => Boolean(clinicId)))];
    if (employeeClinics.length === 1) {
      report('USER_CLINIC_MISSING_DETERMINISTIC', user.id, { username: user.username, role: user.primaryRole, resolvedClinicId: employeeClinics[0] }, true);
    } else {
      report('OPERATIONAL_USER_WITHOUT_CLINIC', user.id, { username: user.username, role: user.primaryRole, employeeClinicIds: employeeClinics });
    }
  }

  for (const employee of employees) {
    const userClinicId = employee.user?.clinicId ?? null;
    if (userClinicId && !employee.clinicId) {
      report('EMPLOYEE_CLINIC_MISSING_DETERMINISTIC', employee.id, { userId: employee.userId, clinicId: userClinicId }, true);
    } else if (!userClinicId && !employee.clinicId) {
      report('EMPLOYEE_AND_USER_WITHOUT_CLINIC', employee.id, { userId: employee.userId });
    } else if (userClinicId && employee.clinicId && userClinicId !== employee.clinicId) {
      report('USER_EMPLOYEE_CLINIC_CONFLICT', employee.id, { userId: employee.userId, userClinicId, employeeClinicId: employee.clinicId });
    } else if (!employee.userId && !employee.clinicId) {
      report('ORPHAN_EMPLOYEE_WITHOUT_CLINIC', employee.id, {});
    }
  }

  for (const unit of serviceUnits) {
    if (!unit.clinicId || !unit.department.clinicId || unit.clinicId === unit.department.clinicId) continue;
    report('SERVICE_UNIT_DEPARTMENT_CROSS_CLINIC', unit.id, { serviceUnitClinicId: unit.clinicId, departmentClinicId: unit.department.clinicId });
  }
  for (const assignment of roomAssignments) {
    const userClinicId = assignment.user.clinicId;
    const roomClinicId = assignment.room.serviceUnit.clinicId;
    if (!userClinicId || !roomClinicId || userClinicId !== roomClinicId) {
      report('ROOM_ASSIGNMENT_CROSS_CLINIC_OR_UNSCOPED', assignment.id, { userClinicId, roomClinicId });
    }
  }
  for (const configuration of configurations) {
    if (!configuration.clinicId) report('LAYER_CONFIGURATION_WITHOUT_CLINIC', configuration.id, {});
  }
}

async function repairDeterministicFindings() {
  for (const finding of findings.filter((entry) => entry.repairable)) {
    const clinicId = String(finding.detail.resolvedClinicId || finding.detail.clinicId);
    await prisma.$transaction(async (tx) => {
      if (finding.category === 'USER_CLINIC_MISSING_DETERMINISTIC') {
        await tx.user.update({ where: { id: finding.id }, data: { clinicId } });
      }
      if (finding.category === 'EMPLOYEE_CLINIC_MISSING_DETERMINISTIC') {
        await tx.employee.update({ where: { id: finding.id }, data: { clinicId } });
      }
      await tx.auditTrail.create({
        data: {
          actorId: null,
          entity: 'CLINIC_MEMBERSHIP',
          entityId: finding.id,
          action: 'UPDATE',
          after: { event: 'CLINIC_MEMBERSHIP_REPAIRED', category: finding.category, clinicId, source: 'audit-tenant-integrity --apply' },
        },
      });
    });
  }
}

async function main() {
  await audit();
  const summary = findings.reduce<Record<string, number>>((result, finding) => {
    result[finding.category] = (result[finding.category] || 0) + 1;
    return result;
  }, {});
  console.info(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', findings: summary, details: findings }, null, 2));
  if (apply && findings.some((finding) => finding.repairable)) {
    await repairDeterministicFindings();
    console.info('Réparations déterministes appliquées. Relancez sans --apply pour confirmer les anomalies restantes.');
  }
  if (findings.some((finding) => !finding.repairable)) process.exitCode = 1;
}

main()
  .catch((error: unknown) => { console.error(error); process.exitCode = 1; })
  .finally(async () => prisma.$disconnect());
