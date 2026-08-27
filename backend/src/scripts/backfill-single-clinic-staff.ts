import { PrismaClient, RoleSlug } from '@prisma/client';

/**
 * One-time, deliberately conservative recovery for installations that were
 * created before clinic ownership was mandatory for staff accounts.
 *
 * It only runs when exactly one active clinic exists.  A multi-clinic database
 * must be repaired explicitly by an administrator; guessing a tenant there
 * would be unsafe.
 */
const prisma = new PrismaClient();

const STAFF_ROLES: RoleSlug[] = [
  RoleSlug.ADMIN,
  RoleSlug.RECEPTIONIST,
  RoleSlug.PHYSICIAN,
  RoleSlug.NURSE,
  RoleSlug.CASHIER,
  RoleSlug.FINANCE,
  RoleSlug.PHARMACIST,
  RoleSlug.LAB_TECHNICIAN,
  RoleSlug.RADIOLOGIST,
];

async function main() {
  const clinics = await prisma.clinic.findMany({
    where: { deletedAt: null, status: 'ACTIVE' },
    select: { id: true, name: true },
  });

  if (clinics.length !== 1) {
    throw new Error(
      `Reprise annulée : ${clinics.length} établissement(s) actif(s) trouvé(s). ` +
      'Le rattachement doit être effectué explicitement en environnement multi-établissement.',
    );
  }

  const clinic = clinics[0];
  const staff = await prisma.user.findMany({
    where: {
      clinicId: null,
      deletedAt: null,
      status: 'ACTIVE',
      primaryRole: { in: STAFF_ROLES },
    },
    select: { id: true, username: true, primaryRole: true },
  });

  if (!staff.length) {
    console.log(`Aucune reprise nécessaire pour ${clinic.name}.`);
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const user of staff) {
      await tx.user.update({ where: { id: user.id }, data: { clinicId: clinic.id } });
      await tx.employee.updateMany({
        where: { userId: user.id, clinicId: null },
        data: { clinicId: clinic.id },
      });
      await tx.auditTrail.create({
        data: {
          actorId: null,
          entity: 'CLINIC_MEMBERSHIP',
          entityId: user.id,
          action: 'UPDATE',
          after: {
            event: 'LEGACY_STAFF_SINGLE_CLINIC_BACKFILL',
            clinicId: clinic.id,
            username: user.username,
            role: user.primaryRole,
            reason: 'Mandatory clinic ownership introduced after legacy staff creation.',
          },
        },
      });
    }
  });

  console.log(`${staff.length} compte(s) opérationnel(s) rattaché(s) à ${clinic.name}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
