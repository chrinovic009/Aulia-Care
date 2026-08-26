import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import {
  AppointmentStatus,
  ConsultationStatus,
  HospitalizationStatus,
  ImagingModality,
  InvoiceStatus,
  InvoiceType,
  MedicationFrequency,
  MedicationRoute,
  PaymentMethod,
  PatientVisitStatus,
  PrismaClient,
} from '@prisma/client';

const databaseUrl = process.env.TEST_DATABASE_URL;

test('parcours PostgreSQL : admission, paiement, consultation, demandes, ordonnance et sortie', { skip: !databaseUrl }, async () => {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const suffix = randomUUID().slice(0, 8);
  let clinicId: string | undefined;

  try {
    const clinic = await prisma.clinic.create({ data: { name: `E2E Core ${suffix}` } });
    clinicId = clinic.id;
    const [receptionist, doctor, nurse] = await Promise.all([
      prisma.user.create({ data: { email: `reception-${suffix}@e2e.local`, username: `reception-${suffix}`, displayName: 'Réception E2E', firstName: 'Réception', lastName: 'E2E', passwordHash: 'test-only', primaryRole: 'RECEPTIONIST', clinicId } }),
      prisma.user.create({ data: { email: `doctor-${suffix}@e2e.local`, username: `doctor-${suffix}`, displayName: 'Médecin E2E', firstName: 'Médecin', lastName: 'E2E', passwordHash: 'test-only', primaryRole: 'PHYSICIAN', clinicId } }),
      prisma.user.create({ data: { email: `nurse-${suffix}@e2e.local`, username: `nurse-${suffix}`, displayName: 'Infirmier E2E', firstName: 'Infirmier', lastName: 'E2E', passwordHash: 'test-only', primaryRole: 'NURSE', clinicId } }),
    ]);
    const patient = await prisma.patient.create({
      data: { firstName: 'Patient', lastName: `E2E ${suffix}`, gender: 'OTHER', dateOfBirth: new Date('1990-01-01T00:00:00.000Z'), clinicId, receptionistId: receptionist.id },
    });
    const appointment = await prisma.appointment.create({
      data: { patientId: patient.id, clinicId, requestedById: receptionist.id, scheduledAt: new Date(), durationMinutes: 30, reason: 'Parcours E2E', status: AppointmentStatus.CHECKED_IN },
    });
    const invoice = await prisma.invoice.create({
      data: { patientId: patient.id, clinicId, issuedById: receptionist.id, type: InvoiceType.ADMISSION_FEE, status: InvoiceStatus.PENDING, totalAmount: 10000, balanceDue: 10000 },
    });
    await prisma.patientVisit.create({
      data: { patientId: patient.id, clinicId, receptionistId: receptionist.id, appointmentId: appointment.id, invoiceId: invoice.id, visitType: 'CONSULTATION', reason: 'Parcours E2E', status: PatientVisitStatus.IN_CONSULTATION },
    });
    await prisma.payment.create({
      data: { invoiceId: invoice.id, clinicId, paidById: receptionist.id, amount: 10000, method: PaymentMethod.CASH, reference: `E2E-${suffix}` },
    });
    await prisma.invoice.update({ where: { id: invoice.id }, data: { status: InvoiceStatus.PAID, balanceDue: 0 } });
    const consultation = await prisma.consultation.create({
      data: { patientId: patient.id, appointmentId: appointment.id, clinicId, providerId: doctor.id, status: ConsultationStatus.IN_PROGRESS, chiefComplaint: 'Douleur test E2E' },
    });
    const medication = await prisma.medication.create({ data: { code: `E2E-${suffix}`, name: 'Paracétamol E2E', unit: 'boîte' } });
    const [labRequest, imagingRequest, prescription] = await Promise.all([
      prisma.labRequest.create({ data: { consultationId: consultation.id, patientId: patient.id, clinicId, requestedById: doctor.id, notes: 'NFS E2E' } }),
      prisma.imagingRequest.create({ data: { consultationId: consultation.id, patientId: patient.id, requestedById: doctor.id, bodyPart: 'Thorax', modality: ImagingModality.XRAY, clinicalIndication: 'Test E2E' } }),
      prisma.prescription.create({
        data: {
          consultationId: consultation.id,
          patientId: patient.id,
          clinicId,
          prescriberId: doctor.id,
          lineItems: { create: [{ medicationId: medication.id, dosage: '500 mg', route: MedicationRoute.ORAL, frequency: MedicationFrequency.DAILY, quantity: 1, durationDays: 3 }] },
        },
      }),
    ]);
    const hospitalization = await prisma.hospitalization.create({ data: { patientId: patient.id, physicianId: doctor.id, nurseInChargeId: nurse.id, admissionReason: 'Surveillance E2E', status: HospitalizationStatus.ADMITTED } });
    await prisma.hospitalization.update({ where: { id: hospitalization.id }, data: { status: HospitalizationStatus.DISCHARGED, dischargedAt: new Date(), dischargeReason: 'Test terminé' } });
    await prisma.consultation.update({ where: { id: consultation.id }, data: { status: ConsultationStatus.FINALIZED } });
    await prisma.appointment.update({ where: { id: appointment.id }, data: { status: AppointmentStatus.COMPLETED } });

    const longitudinalRecord = await prisma.patient.findUniqueOrThrow({
      where: { id: patient.id },
      include: { invoices: { include: { payments: true } }, consultations: { include: { labRequests: true, imagingRequests: true, prescriptions: { include: { lineItems: true } } } }, hospitalizations: true },
    });
    assert.equal(longitudinalRecord.invoices[0]?.status, InvoiceStatus.PAID);
    assert.equal(longitudinalRecord.invoices[0]?.payments.length, 1);
    assert.equal(longitudinalRecord.consultations[0]?.labRequests[0]?.id, labRequest.id);
    assert.equal(longitudinalRecord.consultations[0]?.imagingRequests[0]?.id, imagingRequest.id);
    assert.equal(longitudinalRecord.consultations[0]?.prescriptions[0]?.id, prescription.id);
    assert.equal(longitudinalRecord.consultations[0]?.prescriptions[0]?.lineItems.length, 1);
    assert.equal(longitudinalRecord.hospitalizations[0]?.status, HospitalizationStatus.DISCHARGED);
  } finally {
    await prisma.patient.deleteMany({ where: { lastName: `E2E ${suffix}` } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { email: { endsWith: `-${suffix}@e2e.local` } } }).catch(() => undefined);
    await prisma.medication.deleteMany({ where: { code: `E2E-${suffix}` } }).catch(() => undefined);
    if (clinicId) {
      await prisma.clinic.delete({ where: { id: clinicId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  }
});
