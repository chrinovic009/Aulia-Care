import 'dotenv/config';
import { AuditAction, Prisma, PrismaClient } from '@prisma/client';

/**
 * Repairs only a deterministic legacy case: a Patient has no clinicId while
 * every non-null direct institutional reference points to one clinic.  It does
 * not inspect names or guess from a default clinic.  Downstream workflow rows
 * are deliberately left to the additive Prisma migration, which performs the
 * same deterministic parent backfill in one transaction.
 */
const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');
const confirmed = process.argv.includes('--confirm')
  && process.argv.includes('REPAIR_PATIENT_TENANT_LINKS');

type CandidateRow = {
  patientId: string;
  candidateClinicIds: string[] | null;
};

const candidateQuery = Prisma.sql`
  SELECT
    p.id AS "patientId",
    ARRAY_REMOVE(ARRAY[
      receptionist."clinicId",
      (SELECT invoice."clinicId" FROM "Invoice" invoice
       WHERE invoice."patientId" = p.id AND invoice."clinicId" IS NOT NULL LIMIT 1),
      (SELECT appointment."clinicId" FROM "Appointment" appointment
       WHERE appointment."patientId" = p.id AND appointment."clinicId" IS NOT NULL LIMIT 1),
      (SELECT consultation."clinicId" FROM "Consultation" consultation
       WHERE consultation."patientId" = p.id AND consultation."clinicId" IS NOT NULL LIMIT 1),
      (SELECT visit."clinicId" FROM "PatientVisit" visit
       WHERE visit."patientId" = p.id AND visit."clinicId" IS NOT NULL LIMIT 1),
      (SELECT prescription."clinicId" FROM "Prescription" prescription
       WHERE prescription."patientId" = p.id AND prescription."clinicId" IS NOT NULL LIMIT 1),
      (SELECT lab_request."clinicId" FROM "LabRequest" lab_request
       WHERE lab_request."patientId" = p.id AND lab_request."clinicId" IS NOT NULL LIMIT 1)
    ], NULL) AS "candidateClinicIds"
  FROM "Patient" p
  LEFT JOIN "User" receptionist ON receptionist.id = p."receptionistId"
  WHERE p."clinicId" IS NULL
  ORDER BY p.id
`;

async function main() {
  if (apply && !confirmed) {
    throw new Error(
      'Réparation refusée : utilisez --apply --confirm REPAIR_PATIENT_TENANT_LINKS après avoir relu le rapport.',
    );
  }

  const rows = await prisma.$queryRaw<CandidateRow[]>(candidateQuery);
  const report = rows.map((row) => {
    const clinicIds = [...new Set((row.candidateClinicIds || []).filter(Boolean))];
    return {
      patientId: row.patientId,
      candidateClinicIds: clinicIds,
      repairable: clinicIds.length === 1,
    };
  });

  console.info(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', patients: report }, null, 2));

  const conflicts = report.filter((entry) => !entry.repairable);
  if (conflicts.length) {
    process.exitCode = 1;
    return;
  }

  if (!apply) return;

  for (const entry of report) {
    const clinicId = entry.candidateClinicIds[0];
    await prisma.$transaction(async (tx) => {
      const updated = await tx.$executeRaw(
        Prisma.sql`
          UPDATE "Patient"
          SET "clinicId" = ${clinicId}, "updatedAt" = NOW()
          WHERE id = ${entry.patientId} AND "clinicId" IS NULL
        `,
      );
      if (updated !== 1) {
        throw new Error(`Patient ${entry.patientId} a changé pendant la réparation.`);
      }
      await tx.auditTrail.create({
        data: {
          actorId: null,
          entity: 'Patient',
          entityId: entry.patientId,
          action: AuditAction.UPDATE,
          after: {
            event: 'CLINIC_MEMBERSHIP_REPAIRED',
            clinicId,
            source: 'repair-clinical-patient-tenant-links',
          },
        },
      });
    });
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
