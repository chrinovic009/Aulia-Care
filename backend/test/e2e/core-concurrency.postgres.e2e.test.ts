import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import {
  AppointmentStatus,
  DepartmentType,
  InvoiceType,
  PaymentMethod,
  PatientWorkflowStatus,
  PrismaClient,
  RoleSlug,
  ServiceCategory,
} from '@prisma/client';
import { AppointmentsService } from '../../src/appointments/appointments.service';
import { PaymentsService } from '../../src/billing/payments.service';
import { ClinicContextService } from '../../src/core/clinic-context.service';
import { PatientWorkflowService } from '../../src/core/patient-workflow.service';
import { PrismaService } from '../../src/prisma/prisma.service';

const databaseUrl = process.env.TEST_DATABASE_URL;
const notifications = { notify: () => undefined, notifyToUser: () => undefined } as any;

test(
  'PostgreSQL Core: PaymentsService et AppointmentsService restent atomiques sous concurrence',
  { skip: !databaseUrl },
  async () => {
    if (!databaseUrl) return;

    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const suffix = randomUUID().slice(0, 12);
    let clinicId: string | undefined;

    try {
      const clinic = await prisma.clinic.create({ data: { name: `Core concurrency ${suffix}` } });
      clinicId = clinic.id;
      const [cashier, receptionist] = await Promise.all([
        prisma.user.create({ data: { clinicId, email: `cashier-${suffix}@e2e.invalid`, username: `cashier-${suffix}`, displayName: 'Caissier E2E', firstName: 'Caissier', lastName: 'E2E', passwordHash: 'not-a-real-password', primaryRole: RoleSlug.CASHIER } }),
        prisma.user.create({ data: { clinicId, email: `reception-${suffix}@e2e.invalid`, username: `reception-${suffix}`, displayName: 'Réception E2E', firstName: 'Réception', lastName: 'E2E', passwordHash: 'not-a-real-password', primaryRole: RoleSlug.RECEPTIONIST } }),
      ]);
      const department = await prisma.department.create({
        data: { clinicId, name: `Médecine ${suffix}`, code: `MED-${suffix}`, type: DepartmentType.MEDICAL },
      });
      const serviceUnit = await prisma.serviceUnit.create({
        data: { clinicId, departmentId: department.id, name: `Consultation ${suffix}`, category: ServiceCategory.CONSULTATION },
      });
      const patient = await prisma.patient.create({
        data: { clinicId, firstName: 'Concurrent', lastName: suffix, gender: 'OTHER', dateOfBirth: new Date('1990-01-01'), workflowStatus: PatientWorkflowStatus.EN_ATTENTE_DE_PAIEMENT },
      });
      const invoice = await prisma.invoice.create({
        data: { clinicId, patientId: patient.id, type: InvoiceType.ADMISSION_FEE, totalAmount: 100, balanceDue: 100 },
      });
      const patientForAppointment = await prisma.patient.create({
        data: { clinicId, firstName: 'RendezVous', lastName: suffix, gender: 'OTHER', dateOfBirth: new Date('1991-01-01'), workflowStatus: PatientWorkflowStatus.EN_ATTENTE_MEDECIN },
      });

      const workflow = new PatientWorkflowService();
      const payments = new PaymentsService(prisma as unknown as PrismaService, notifications, workflow);
      const appointments = new AppointmentsService(
        prisma as unknown as PrismaService,
        notifications,
        new ClinicContextService(prisma as unknown as PrismaService),
        workflow,
      );
      const payment = () => payments.createPayment({ invoiceId: invoice.id, amount: 100, method: PaymentMethod.CASH }, cashier.id);
      const appointmentStart = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const book = () => appointments.create({
        patientId: patientForAppointment.id,
        serviceUnitId: serviceUnit.id,
        scheduledAt: appointmentStart,
        durationMinutes: 30,
        status: AppointmentStatus.SCHEDULED,
        reason: 'Concurrence rendez-vous E2E',
      }, receptionist.id);

      const [paymentResults, appointmentResults] = await Promise.all([
        Promise.allSettled([payment(), payment()]),
        Promise.allSettled([book(), book()]),
      ]);
      assert.equal(paymentResults.filter((result) => result.status === 'fulfilled').length, 1);
      assert.equal(paymentResults.filter((result) => result.status === 'rejected').length, 1);
      assert.equal(
        appointmentResults.filter((result) => result.status === 'fulfilled').length,
        1,
        appointmentResults
          .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
          .map((result) => String(result.reason?.message || result.reason))
          .join(' | '),
      );
      assert.equal(appointmentResults.filter((result) => result.status === 'rejected').length, 1);

      const [storedInvoice, paymentsCount, appointmentsCount] = await Promise.all([
        prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } }),
        prisma.payment.count({ where: { invoiceId: invoice.id } }),
        prisma.appointment.count({ where: { clinicId, serviceUnitId: serviceUnit.id } }),
      ]);
      assert.equal(storedInvoice.balanceDue.toString(), '0');
      assert.equal(paymentsCount, 1);
      assert.equal(appointmentsCount, 1);
    } finally {
      if (clinicId) {
        await prisma.notification.deleteMany({ where: { patient: { clinicId } } }).catch(() => undefined);
        await prisma.patientVisit.deleteMany({ where: { clinicId } }).catch(() => undefined);
        await prisma.medicalHistory.deleteMany({ where: { patient: { clinicId } } }).catch(() => undefined);
        await prisma.appointment.deleteMany({ where: { clinicId } }).catch(() => undefined);
        await prisma.payment.deleteMany({ where: { clinicId } }).catch(() => undefined);
        await prisma.invoice.deleteMany({ where: { clinicId } }).catch(() => undefined);
        await prisma.patient.deleteMany({ where: { clinicId } }).catch(() => undefined);
        await prisma.serviceUnit.deleteMany({ where: { clinicId } }).catch(() => undefined);
        await prisma.department.deleteMany({ where: { clinicId } }).catch(() => undefined);
        await prisma.user.deleteMany({ where: { clinicId } }).catch(() => undefined);
        await prisma.clinic.delete({ where: { id: clinicId } }).catch(() => undefined);
      }
      await prisma.$disconnect();
    }
  },
);
