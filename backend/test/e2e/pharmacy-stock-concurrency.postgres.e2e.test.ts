import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { PrismaClient, RoleSlug } from '@prisma/client';
import { PharmacyService } from '../../src/pharmacy/pharmacy.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ClinicContextService } from '../../src/core/clinic-context.service';

const databaseUrl = process.env.TEST_DATABASE_URL;

test('PostgreSQL: concurrent pharmacy sales cannot exceed one clinic lot or consume another clinic stock', { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const suffix = randomUUID().slice(0, 12);
  let clinicAId: string | undefined;
  let clinicBId: string | undefined;
  let medicationId: string | undefined;
  let pharmacistAId: string | undefined;
  let pharmacistBId: string | undefined;
  try {
    const [clinicA, clinicB] = await Promise.all([
      prisma.clinic.create({ data: { name: `Stock A ${suffix}` } }),
      prisma.clinic.create({ data: { name: `Stock B ${suffix}` } }),
    ]);
    clinicAId = clinicA.id;
    clinicBId = clinicB.id;
    const [pharmacistA, pharmacistB] = await Promise.all([
      prisma.user.create({ data: { clinicId: clinicA.id, email: `pharm-a-${suffix}@test.local`, username: `pharm-a-${suffix}`, displayName: 'Pharmacist A', firstName: 'Pharmacist', lastName: 'A', passwordHash: 'test-only', primaryRole: RoleSlug.PHARMACIST } }),
      prisma.user.create({ data: { clinicId: clinicB.id, email: `pharm-b-${suffix}@test.local`, username: `pharm-b-${suffix}`, displayName: 'Pharmacist B', firstName: 'Pharmacist', lastName: 'B', passwordHash: 'test-only', primaryRole: RoleSlug.PHARMACIST } }),
    ]);
    pharmacistAId = pharmacistA.id;
    pharmacistBId = pharmacistB.id;
    const medication = await prisma.medication.create({ data: { code: `STOCK-${suffix}`, name: `Medication ${suffix}`, unit: 'tablet' } });
    medicationId = medication.id;
    const liveLot = await prisma.stockLot.create({ data: { clinicId: clinicA.id, medicationId: medication.id, batchNumber: `LIVE-${suffix}`, quantity: 10, expiryDate: new Date(Date.now() + 365 * 86_400_000) } });
    const expiredLot = await prisma.stockLot.create({ data: { clinicId: clinicA.id, medicationId: medication.id, batchNumber: `OLD-${suffix}`, quantity: 100, expiryDate: new Date(Date.now() - 86_400_000) } });
    const otherClinicLot = await prisma.stockLot.create({ data: { clinicId: clinicB.id, medicationId: medication.id, batchNumber: `OTHER-${suffix}`, quantity: 100, expiryDate: new Date(Date.now() + 365 * 86_400_000) } });
    const service = new PharmacyService(
      prisma as unknown as PrismaService,
      { requireOperationalActor: async ({ userId }: { userId: string }) => userId === pharmacistA.id
        ? { id: pharmacistA.id, clinicId: clinicA.id, primaryRole: RoleSlug.PHARMACIST }
        : { id: pharmacistB.id, clinicId: clinicB.id, primaryRole: RoleSlug.PHARMACIST },
      } as unknown as ClinicContextService,
    );

    const results = await Promise.allSettled([
      service.createIndependentSale({ medicationId: medication.id, quantity: 6 }, pharmacistA.id),
      service.createIndependentSale({ medicationId: medication.id, quantity: 6 }, pharmacistA.id),
    ]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
    assert.equal((await prisma.stockLot.findUniqueOrThrow({ where: { id: liveLot.id } })).quantity, 4);
    assert.equal((await prisma.stockLot.findUniqueOrThrow({ where: { id: expiredLot.id } })).quantity, 100);
    assert.equal((await prisma.stockLot.findUniqueOrThrow({ where: { id: otherClinicLot.id } })).quantity, 100);
    const movements = await prisma.stockTransaction.findMany({ where: { medicationId: medication.id, clinicId: clinicA.id, type: 'OUT' } });
    assert.equal(movements.length, 1);
    assert.equal(movements[0].quantity, 6);
    assert.equal(movements[0].lotId, liveLot.id);

    await assert.rejects(service.createIndependentSale({ medicationId: medication.id, quantity: 5 }, pharmacistA.id), /Stock insuffisant/);
    await assert.rejects(service.createIndependentSale({ medicationId: medication.id, quantity: -1 }, pharmacistA.id), /quantit/);
    assert.equal((await prisma.stockLot.findUniqueOrThrow({ where: { id: otherClinicLot.id } })).quantity, 100);
  } finally {
    if (medicationId) {
      await prisma.stockTransaction.deleteMany({ where: { medicationId } });
      await prisma.stockLot.deleteMany({ where: { medicationId } });
      await prisma.medication.delete({ where: { id: medicationId } });
    }
    if (pharmacistAId || pharmacistBId) await prisma.user.deleteMany({ where: { id: { in: [pharmacistAId, pharmacistBId].filter((id): id is string => Boolean(id)) } } });
    if (clinicAId || clinicBId) await prisma.clinic.deleteMany({ where: { id: { in: [clinicAId, clinicBId].filter((id): id is string => Boolean(id)) } } });
    await prisma.$disconnect();
  }
});
