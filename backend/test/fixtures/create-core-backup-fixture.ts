import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const url = process.env.TEST_DATABASE_URL;
if (!url || process.env.AULIA_SYNTHETIC_FIXTURE_CONFIRM !== 'DISPOSABLE_DATABASE_ONLY') {
  throw new Error('Synthetic backup fixture requires TEST_DATABASE_URL and explicit disposable-database confirmation.');
}
const database = new URL(url);
if (database.hostname !== '127.0.0.1' || database.pathname !== '/aulia_core_test') {
  throw new Error('Refusing to write synthetic backup fixture outside the isolated local test database.');
}

const prisma = new PrismaClient({ datasources: { db: { url } } });
const suffix = randomUUID().slice(0, 12);

async function main() {
  const fixture = await prisma.$transaction(async (tx) => {
    const clinic = await tx.clinic.create({ data: { name: `Restore Fixture ${suffix}` } });
    const doctor = await tx.user.create({ data: {
      clinicId: clinic.id, email: `restore-doctor-${suffix}@test.local`, username: `restore-doctor-${suffix}`,
      displayName: 'Synthetic Doctor', firstName: 'Synthetic', lastName: 'Doctor', passwordHash: 'non-login-test-fixture', primaryRole: 'PHYSICIAN',
    } });
    const patient = await tx.patient.create({ data: {
      clinicId: clinic.id, firstName: 'Synthetic', lastName: 'Patient', gender: 'OTHER', dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
    } });
    const appointment = await tx.appointment.create({ data: { clinicId: clinic.id, patientId: patient.id, scheduledAt: new Date(), reason: 'Synthetic restore proof' } });
    const consultation = await tx.consultation.create({ data: {
      clinicId: clinic.id, patientId: patient.id, appointmentId: appointment.id, providerId: doctor.id, chiefComplaint: 'Synthetic restore proof',
    } });
    const medication = await tx.medication.create({ data: { code: `RESTORE-${suffix}`, name: `Restore Medication ${suffix}`, unit: 'tablet' } });
    const prescription = await tx.prescription.create({ data: {
      clinicId: clinic.id, patientId: patient.id, consultationId: consultation.id, prescriberId: doctor.id,
      lineItems: { create: { medicationId: medication.id, dosage: '1 tablet', route: 'ORAL', frequency: 'DAILY', quantity: 2 } },
    } });
    const invoice = await tx.invoice.create({ data: {
      clinicId: clinic.id, patientId: patient.id, issuedById: doctor.id, prescriptionId: prescription.id,
      prescriptionVersion: prescription.version, type: 'PHARMACY', status: 'PARTIALLY_PAID', totalAmount: 100, balanceDue: 40,
    } });
    const payment = await tx.payment.create({ data: {
      clinicId: clinic.id, invoiceId: invoice.id, paidById: doctor.id, amount: 60, method: 'CASH',
    } });
    const stockLot = await tx.stockLot.create({ data: {
      clinicId: clinic.id, medicationId: medication.id, batchNumber: `RESTORE-${suffix}`, quantity: 10,
      expiryDate: new Date('2030-01-01T00:00:00.000Z'),
    } });
    const hospitalization = await tx.hospitalization.create({ data: {
      clinicId: clinic.id, patientId: patient.id, physicianId: doctor.id, admissionReason: 'Synthetic restore proof',
    } });
    return { clinicId: clinic.id, patientId: patient.id, consultationId: consultation.id, prescriptionId: prescription.id, invoiceId: invoice.id, paymentId: payment.id, stockLotId: stockLot.id, hospitalizationId: hospitalization.id };
  });
  process.stdout.write(`${JSON.stringify(fixture)}\n`);
}

main().finally(() => prisma.$disconnect());
