import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { AppointmentStatus, DepartmentType, PaymentMethod, PrismaClient, ServiceCategory } from '@prisma/client';

const databaseUrl = process.env.TEST_DATABASE_URL;

test(
  'PostgreSQL Core: paiements et rendez-vous concurrents restent atomiques',
  { skip: !databaseUrl },
  async () => {
    if (!databaseUrl) return;

    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const suffix = randomUUID().slice(0, 12);
    let clinicId: string | undefined;
    let patientId: string | undefined;
    let departmentId: string | undefined;
    let serviceUnitId: string | undefined;
    let invoiceId: string | undefined;

    try {
      const clinic = await prisma.clinic.create({ data: { name: `Core concurrency ${suffix}` } });
      clinicId = clinic.id;
      const department = await prisma.department.create({
        data: {
          clinicId: clinic.id,
          name: `Médecine ${suffix}`,
          code: `MED-${suffix}`,
          type: DepartmentType.MEDICAL,
        },
      });
      departmentId = department.id;
      const serviceUnit = await prisma.serviceUnit.create({
        data: { clinicId: clinic.id, departmentId: department.id, name: `Consultation ${suffix}`, category: ServiceCategory.CONSULTATION },
      });
      serviceUnitId = serviceUnit.id;
      const patient = await prisma.patient.create({
        data: {
          clinicId: clinic.id,
          firstName: 'Concurrent',
          lastName: suffix,
          gender: 'OTHER',
          dateOfBirth: new Date('1990-01-01'),
        },
      });
      patientId = patient.id;
      const invoice = await prisma.invoice.create({
        data: {
          clinicId: clinic.id,
          patientId: patient.id,
          type: 'SERVICE',
          totalAmount: 100,
          balanceDue: 100,
        },
      });
      invoiceId = invoice.id;

      const pay = async () => prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT id FROM "Invoice" WHERE id = ${invoice.id} FOR UPDATE`;
        const locked = await tx.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
        const balance = Number(locked.balanceDue);
        if (balance < 100 || locked.status === 'PAID') throw new Error('invoice-already-settled');
        await tx.payment.create({
          data: {
            invoiceId: invoice.id,
            clinicId: clinic.id,
            amount: 100,
            method: PaymentMethod.CASH,
          },
        });
        await tx.invoice.update({ where: { id: invoice.id }, data: { status: 'PAID', balanceDue: 0 } });
      });

      const appointmentStart = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const book = async () => prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`appointments:${clinic.id}:${serviceUnit.id}`}))`;
        const existing = await tx.appointment.findFirst({
          where: {
            clinicId: clinic.id,
            serviceUnitId: serviceUnit.id,
            status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED, AppointmentStatus.CHECKED_IN] },
            scheduledAt: { gte: new Date(appointmentStart.getTime() - 8 * 60 * 60 * 1000), lt: new Date(appointmentStart.getTime() + 30 * 60 * 1000) },
            deletedAt: null,
          },
        });
        if (existing) throw new Error('appointment-slot-occupied');
        await tx.appointment.create({
          data: {
            clinicId: clinic.id,
            patientId: patient.id,
            serviceUnitId: serviceUnit.id,
            scheduledAt: appointmentStart,
            durationMinutes: 30,
            status: AppointmentStatus.SCHEDULED,
          },
        });
      });

      const [paymentResults, appointmentResults] = await Promise.all([
        Promise.allSettled([pay(), pay()]),
        Promise.allSettled([book(), book()]),
      ]);

      assert.equal(paymentResults.filter((result) => result.status === 'fulfilled').length, 1);
      assert.equal(paymentResults.filter((result) => result.status === 'rejected').length, 1);
      assert.equal(appointmentResults.filter((result) => result.status === 'fulfilled').length, 1);
      assert.equal(appointmentResults.filter((result) => result.status === 'rejected').length, 1);

      const [storedInvoice, payments, appointments] = await Promise.all([
        prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } }),
        prisma.payment.count({ where: { invoiceId: invoice.id } }),
        prisma.appointment.count({ where: { clinicId: clinic.id, serviceUnitId: serviceUnit.id } }),
      ]);
      assert.equal(storedInvoice.balanceDue.toString(), '0');
      assert.equal(payments, 1);
      assert.equal(appointments, 1);
    } finally {
      if (clinicId) {
        await prisma.appointment.deleteMany({ where: { clinicId: clinicId } }).catch(() => undefined);
        if (invoiceId) await prisma.payment.deleteMany({ where: { invoiceId } }).catch(() => undefined);
        await prisma.invoice.deleteMany({ where: { clinicId: clinicId } }).catch(() => undefined);
        if (patientId) await prisma.patient.deleteMany({ where: { id: patientId } }).catch(() => undefined);
        if (serviceUnitId) await prisma.serviceUnit.deleteMany({ where: { id: serviceUnitId } }).catch(() => undefined);
        if (departmentId) await prisma.department.deleteMany({ where: { id: departmentId } }).catch(() => undefined);
        await prisma.clinic.delete({ where: { id: clinicId } }).catch(() => undefined);
      }
      await prisma.$disconnect();
    }
  },
);
