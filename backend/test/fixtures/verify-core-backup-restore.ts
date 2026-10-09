import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';

const sourceUrl = process.env.TEST_DATABASE_URL;
const restoredUrl = process.env.RESTORED_TEST_DATABASE_URL;
const clinicId = process.env.AULIA_SYNTHETIC_CLINIC_ID;
if (!sourceUrl || !restoredUrl || !clinicId || sourceUrl === restoredUrl) {
  throw new Error('Two distinct disposable URLs and a synthetic clinic id are required.');
}
for (const value of [sourceUrl, restoredUrl]) {
  const parsed = new URL(value);
  if (parsed.hostname !== '127.0.0.1' || !parsed.pathname.startsWith('/aulia_core_')) {
    throw new Error('Refusing to inspect a non-disposable database.');
  }
}

const source = new PrismaClient({ datasources: { db: { url: sourceUrl } } });
const restored = new PrismaClient({ datasources: { db: { url: restoredUrl } } });

async function snapshot(prisma: PrismaClient) {
  const clinic = await prisma.clinic.findUniqueOrThrow({ where: { id: clinicId } });
  const patient = await prisma.patient.findFirstOrThrow({ where: { clinicId, firstName: 'Synthetic', lastName: 'Patient' } });
  const consultation = await prisma.consultation.findFirstOrThrow({ where: { clinicId, patientId: patient.id } });
  const prescription = await prisma.prescription.findFirstOrThrow({ where: { clinicId, patientId: patient.id, consultationId: consultation.id }, include: { lineItems: true } });
  const invoice = await prisma.invoice.findFirstOrThrow({ where: { clinicId, patientId: patient.id, prescriptionId: prescription.id }, include: { payments: true } });
  const stockLot = await prisma.stockLot.findFirstOrThrow({ where: { clinicId, medicationId: prescription.lineItems[0].medicationId } });
  const hospitalization = await prisma.hospitalization.findFirstOrThrow({ where: { clinicId, patientId: patient.id } });
  const migrations = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT count(*)::bigint AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`;
  return {
    clinicId: clinic.id, patientId: patient.id, consultationId: consultation.id,
    prescriptionId: prescription.id, prescriptionLineId: prescription.lineItems[0].id,
    invoiceId: invoice.id, invoiceTotal: invoice.totalAmount.toString(), invoiceBalance: invoice.balanceDue.toString(),
    invoiceVersion: invoice.prescriptionVersion,
    paymentId: invoice.payments[0]?.id, paymentAmount: invoice.payments[0]?.amount.toString(),
    stockLotId: stockLot.id, stockQuantity: stockLot.quantity,
    hospitalizationId: hospitalization.id, hospitalizationStatus: hospitalization.status,
    migrations: Number(migrations[0].count),
  };
}

async function main() {
  const [before, after] = await Promise.all([snapshot(source), snapshot(restored)]);
  assert.deepEqual(after, before);
  assert.equal(after.migrations, 23);
  assert.equal(after.invoiceTotal, '100');
  assert.equal(after.invoiceBalance, '40');
  assert.equal(after.paymentAmount, '60');
  assert.equal(after.stockQuantity, 10);
  process.stdout.write(`RESTORE_CHAIN_MATCHED=true; MIGRATIONS=${after.migrations}\n`);
}

main().finally(async () => {
  await source.$disconnect();
  await restored.$disconnect();
});
