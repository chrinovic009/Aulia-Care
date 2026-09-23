import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import * as bcrypt from 'bcrypt';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import {
  AuliaLayer,
  DepartmentType,
  ImagingModality,
  PaymentMethod,
  PrismaClient,
  RoleSlug,
  ServiceCategory,
} from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { AuthService } from '../../src/auth/auth.service';

const databaseUrl = process.env.TEST_DATABASE_URL;

type LoginUser = {
  id: string;
  email: string;
  username: string;
  displayName: string;
  firstName: string;
  lastName: string;
  primaryRole: RoleSlug | null;
  status: 'ACTIVE';
};

const cookiesFor = async (auth: AuthService, user: LoginUser) => {
  const session = await auth.login(user);
  return [`aulia_access_token=${session.accessToken}`];
};

/**
 * The fixture only provisions reference data. Every business transition is
 * made through the public Nest HTTP controllers, as a real browser would.
 */
test(
  'HTTP E2E Core: admission, paiement, clinique, examens, pharmacie, portail, chirurgie et finance',
  { skip: !databaseUrl },
  async () => {
    if (!databaseUrl) return;

    const suffix = randomUUID().slice(0, 12);
    const password = 'Core-Patient-Journey-2026!';
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    let app: INestApplication | undefined;
    let clinicId: string | undefined;

    try {
      process.env.DATABASE_URL = databaseUrl;
      process.env.JWT_SECRET ??= 'core_patient_journey_access_secret';
      process.env.JWT_REFRESH_SECRET ??= 'core_patient_journey_refresh_secret';
      process.env.CORS_ORIGIN ??= 'http://localhost:5173';

      const clinic = await prisma.clinic.create({
        data: { name: `Parcours Core ${suffix}` },
      });
      clinicId = clinic.id;
      await prisma.platformLayerConfiguration.create({
        data: {
          clinicId: clinic.id,
          enabledLayers: [AuliaLayer.CORE],
          configuredAt: new Date(),
          configurationVersion: 1,
        },
      });

      const passwordHash = await bcrypt.hash(password, 10);
      const makeUser = (role: RoleSlug, label: string) =>
        prisma.user.create({
          data: {
            clinicId: clinic.id,
            email: `${label}-${suffix}@e2e.local`,
            username: `${label}-${suffix}`,
            displayName: label,
            firstName: label,
            lastName: 'E2E',
            passwordHash,
            primaryRole: role,
          },
          select: {
            id: true,
            email: true,
            username: true,
            displayName: true,
            firstName: true,
            lastName: true,
            primaryRole: true,
            status: true,
          },
        });

      const [receptionist, cashier, nurse, physician, labManager, radiologist, pharmacist, finance] = await Promise.all([
        makeUser(RoleSlug.RECEPTIONIST, 'reception'),
        makeUser(RoleSlug.CASHIER, 'cashier'),
        makeUser(RoleSlug.NURSE, 'nurse'),
        makeUser(RoleSlug.PHYSICIAN, 'physician'),
        makeUser(RoleSlug.LAB_MANAGER, 'lab-manager'),
        makeUser(RoleSlug.RADIOLOGIST, 'radiologist'),
        makeUser(RoleSlug.PHARMACIST, 'pharmacist'),
        makeUser(RoleSlug.FINANCE, 'finance'),
      ]);

      const receptionService = await prisma.service.create({
        data: {
          clinicId: clinic.id,
          name: 'Consultation générale - réception',
          active: true,
          category: ServiceCategory.CONSULTATION,
          tarifs: { create: { prix: 10_000, actif: true } },
        },
      });
      const paramedicalService = await prisma.service.create({
        data: {
          clinicId: clinic.id,
          name: `Kinésithérapie ${suffix}`,
          active: true,
          isParamedical: true,
          category: ServiceCategory.OTHER_CLINICAL,
          tarifs: { create: { prix: 7_500, actif: true } },
        },
      });
      const clinicalService = await prisma.service.create({
        data: {
          clinicId: clinic.id,
          name: `Médecine générale ${suffix}`,
          active: true,
          category: ServiceCategory.CONSULTATION,
        },
      });
      const department = await prisma.department.create({
        data: {
          clinicId: clinic.id,
          name: `Médecine ${suffix}`,
          code: `MED-${suffix}`,
          type: DepartmentType.MEDICAL,
        },
      });
      await prisma.serviceUnit.create({
        data: {
          clinicId: clinic.id,
          departmentId: department.id,
          name: clinicalService.name,
          category: ServiceCategory.CONSULTATION,
        },
      });

      const labSection = await prisma.labSection.create({ data: { name: `Lab ${suffix}` } });
      const labCategory = await prisma.labCategory.create({
        data: { sectionId: labSection.id, name: `Bio ${suffix}`, code: `BIO-${suffix}` },
      });
      const labTest = await prisma.labTest.create({
        data: {
          sectionId: labSection.id,
          categoryId: labCategory.id,
          code: `GLU-${suffix}`,
          name: `Glycémie ${suffix}`,
          price: 4_000,
        },
      });
      const labParameter = await prisma.labTestParameter.create({
        data: {
          labTestId: labTest.id,
          code: `GLU-P-${suffix}`,
          name: 'Glycémie',
          criticalHigh: 30,
        },
      });
      const imagingCatalogue = await prisma.imagingCatalogue.create({
        data: {
          clinicId: clinic.id,
          code: `XR-${suffix}`,
          name: `Radiographie thoracique ${suffix}`,
          price: 12_000,
          modality: ImagingModality.XRAY,
        },
      });
      const medicationSection = await prisma.medicationSection.create({
        data: { name: `Médicaments ${suffix}`, code: `MEDSEC-${suffix}` },
      });
      const medicationCategory = await prisma.medicationCategory.create({
        data: {
          sectionId: medicationSection.id,
          name: `Antalgiques ${suffix}`,
          code: `ANT-${suffix}`,
        },
      });
      const medication = await prisma.medication.create({
        data: {
          categoryId: medicationCategory.id,
          code: `PARA-${suffix}`,
          name: `Paracétamol ${suffix}`,
          unit: 'comprimé',
        },
      });
      await prisma.stockLot.create({
        data: {
          clinicId: clinic.id,
          medicationId: medication.id,
          batchNumber: `LOT-${suffix}`,
          quantity: 100,
          purchasePrice: 500,
        },
      });
      const operatingRoom = await prisma.operatingRoom.create({
        data: {
          clinicId: clinic.id,
          name: `Bloc ${suffix}`,
          location: 'Aile chirurgicale',
        },
      });

      const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
      const auth = moduleRef.get(AuthService);
      app = moduleRef.createNestApplication();
      app.setGlobalPrefix('api');
      app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
      await app.init();
      const server = app.getHttpServer();
      const [receptionCookies, cashierCookies, nurseCookies, physicianCookies, labCookies, radiologistCookies, pharmacistCookies, financeCookies] = await Promise.all([
        cookiesFor(auth, receptionist),
        cookiesFor(auth, cashier),
        cookiesFor(auth, nurse),
        cookiesFor(auth, physician),
        cookiesFor(auth, labManager),
        cookiesFor(auth, radiologist),
        cookiesFor(auth, pharmacist),
        cookiesFor(auth, finance),
      ]);

      const admission = await request(server)
        .post('/api/patients/admissions')
        .set('Cookie', receptionCookies)
        .send({
          firstName: 'Alice',
          lastName: `Core-${suffix}`,
          gender: 'FEMALE',
          dateOfBirth: '1990-01-01',
          admissionType: 'CLASSIQUE',
          billingServiceId: receptionService.id,
        })
        .expect(201);
      const patientId = admission.body.patient.id as string;
      const admissionInvoiceId = admission.body.invoice.id as string;
      assert.equal(admission.body.visit.status, 'AWAITING_PAYMENT');

      await request(server)
        .post('/api/payments')
        .set('Cookie', cashierCookies)
        .send({ invoiceId: admissionInvoiceId, amount: 10_000, method: PaymentMethod.CASH })
        .expect(201);

      const appointment = await request(server)
        .post('/api/appointments')
        .set('Cookie', receptionCookies)
        .send({
          patientId,
          serviceId: clinicalService.id,
          scheduledAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
          durationMinutes: 30,
          reason: 'Contrôle post-admission',
          status: 'CONFIRMED',
        })
        .expect(201);
      await request(server)
        .patch(`/api/appointments/${appointment.body.id}`)
        .set('Cookie', receptionCookies)
        .send({ status: 'CHECKED_IN' })
        .expect(200);

      await request(server)
        .post(`/api/patients/${patientId}/vital-signs`)
        .set('Cookie', nurseCookies)
        .send({ temperature: '37.2', heartRate: '78', bloodPressure: '120/80', physicianId: physician.id })
        .expect(201);
      const triageConsultation = await prisma.consultation.findFirst({
        where: { patientId, clinicId: clinic.id, providerId: physician.id, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      const consultationId = triageConsultation?.id;
      assert.ok(consultationId, 'Le triage doit ouvrir une consultation attribuée au médecin.');

      const labRequest = await request(server)
        .post(`/api/consultations/${consultationId}/lab-requests`)
        .set('Cookie', physicianCookies)
        .send({ labTestId: labTest.id, specimenType: 'Sang' })
        .expect(201);
      const labInvoice = await prisma.invoice.findFirstOrThrow({
        where: { clinicId: clinic.id, remarks: { contains: `LabRequest:${labRequest.body.id}` } },
      });
      await request(server)
        .post('/api/payments')
        .set('Cookie', cashierCookies)
        .send({ invoiceId: labInvoice.id, amount: Number(labInvoice.totalAmount), method: PaymentMethod.CASH })
        .expect(201);
      await request(server)
        .post(`/api/laboratory/requests/${labRequest.body.id}/results`)
        .set('Cookie', labCookies)
        .send({
          resultName: 'Glycémie contrôlée',
          resultValue: '5.4',
          parameters: [{ labTestParameterId: labParameter.id, valueNumeric: 5.4 }],
        })
        .expect(201);

      const imagingRequest = await request(server)
        .post(`/api/consultations/${consultationId}/imaging-requests`)
        .set('Cookie', physicianCookies)
        .send({
          consultationId,
          patientId,
          imagingCatalogueId: imagingCatalogue.id,
          bodyPart: 'Thorax',
          clinicalIndication: 'Toux persistante',
        })
        .expect(201);
      const imagingInvoice = await prisma.invoice.findFirstOrThrow({
        where: { clinicId: clinic.id, remarks: { contains: `ImagingRequest:${imagingRequest.body.id}` } },
      });
      await request(server)
        .post('/api/payments')
        .set('Cookie', cashierCookies)
        .send({ invoiceId: imagingInvoice.id, amount: Number(imagingInvoice.totalAmount), method: PaymentMethod.CASH })
        .expect(201);
      await request(server)
        .post(`/api/imaging/${imagingRequest.body.id}/report`)
        .set('Cookie', radiologistCookies)
        .send({ findings: 'Pas d’anomalie aiguë.', impression: 'Examen sans urgence.', verified: true })
        .expect(201);

      const prescription = await request(server)
        .post(`/api/consultations/${consultationId}/prescriptions`)
        .set('Cookie', physicianCookies)
        .send({ lines: [{ medicationId: medication.id, dosage: '500 mg', quantity: 2, durationDays: 1 }] })
        .expect(201);
      const prescriptionId = prescription.body.prescription.id as string;
      await request(server)
        .post('/api/payments')
        .set('Cookie', cashierCookies)
        .send({ invoiceId: prescription.body.invoice.id, amount: 1_000, method: PaymentMethod.CASH })
        .expect(201);
      await request(server)
        .post(`/api/pharmacy/prescriptions/${prescriptionId}/dispense`)
        .set('Cookie', pharmacistCookies)
        .send({ notes: 'Traitement remis au patient.' })
        .expect(201);

      await request(server)
        .post(`/api/consultations/${consultationId}/clinical-sections`)
        .set('Cookie', physicianCookies)
        .send({ diagnosisText: 'Syndrome grippal simple', clinicalSummary: { conclusion: 'Retour à domicile' }, status: 'FINALIZED', attestation: true })
        .expect(201);

      const surgery = await request(server)
        .post('/api/surgery')
        .set('Cookie', physicianCookies)
        .send({
          patientId,
          consultationId,
          operatingRoomId: operatingRoom.id,
          scheduledAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          procedureName: 'Intervention de contrôle E2E',
          indication: 'Test de planification du bloc',
        })
        .expect(201);
      await request(server)
        .post(`/api/surgery/${surgery.body.id}/safety-checklist`)
        .set('Cookie', physicianCookies)
        .send({
          identityConfirmed: true,
          procedureSiteConfirmed: true,
          consentConfirmed: true,
          anesthesiaCheckDone: true,
          antibioticProphylaxis: true,
          imagingAvailable: true,
          instrumentCountCorrect: true,
          specimenLabelled: true,
        })
        .expect(201);

      const portalUser = await prisma.user.findFirstOrThrow({
        where: { primaryRole: RoleSlug.PATIENT, patientPortalProfile: { is: { id: patientId } } },
        select: { id: true, email: true, username: true, displayName: true, firstName: true, lastName: true, primaryRole: true, status: true },
      });
      const portalCookies = await cookiesFor(auth, portalUser);
      const profile = await request(server)
        .get('/api/patients/me/profile')
        .set('Cookie', portalCookies)
        .expect(200);
      assert.equal(profile.body.id, patientId);
      assert.ok(profile.body.labRequests.length >= 1);
      assert.ok(profile.body.imagingRequests.length >= 1);
      assert.ok(profile.body.prescriptions.length >= 1);
      assert.ok(profile.body.invoices.length >= 4);

      await request(server)
        .get('/api/billing/finance/dashboard')
        .set('Cookie', financeCookies)
        .expect(200);

      const voucher = await request(server)
        .post('/api/patients/admissions')
        .set('Cookie', receptionCookies)
        .send({
          firstName: 'Benoît',
          lastName: `Bon-${suffix}`,
          gender: 'MALE',
          dateOfBirth: '1988-02-02',
          admissionType: 'BON_PARAMEDICAL',
          serviceId: paramedicalService.id,
          voucherNumber: `BON-${suffix}`,
          voucherIssuer: 'Entreprise de test',
        })
        .expect(201);
      assert.equal(voucher.body.invoice.type, 'SERVICE');

      const company = await request(server)
        .post('/api/subscriptions/companies')
        .set('Cookie', receptionCookies)
        .send({ name: `Entreprise ${suffix}`, contractNumber: `SUB-${suffix}`, billingDay: 28 })
        .expect(201);
      const subscriber = await request(server)
        .post(`/api/subscriptions/companies/${company.body.id}/employees`)
        .set('Cookie', receptionCookies)
        .send({ firstName: 'Claire', lastName: `Abonnée-${suffix}`, gender: 'FEMALE', dateOfBirth: '1995-03-03', policyNumber: `POL-${suffix}` })
        .expect(201);
      const subscriptionAdmission = await request(server)
        .post(`/api/subscriptions/employees/${subscriber.body.id}/admit`)
        .set('Cookie', receptionCookies)
        .send({ consultationKind: 'CONSULTATION_GENERALE' });
      assert.equal(
        subscriptionAdmission.status,
        201,
        `Admission abonnement refusée: ${JSON.stringify(subscriptionAdmission.body)}`,
      );
      assert.equal(subscriptionAdmission.body.patient.clinicId, clinic.id);
      assert.equal(subscriptionAdmission.body.visit.status, 'ORIENTED');
    } finally {
      if (app) await app.close();
      if (clinicId) {
        const clinicScope = { clinicId };
        await prisma.surgerySafetyChecklist.deleteMany({ where: { surgery: { patient: clinicScope } } }).catch(() => undefined);
        await prisma.surgery.deleteMany({ where: { patient: clinicScope } }).catch(() => undefined);
        await prisma.pharmacyDispense.deleteMany({ where: { clinicId } }).catch(() => undefined);
        await prisma.prescription.deleteMany({ where: { clinicId } }).catch(() => undefined);
        await prisma.imagingReport.deleteMany({ where: { imagingRequest: clinicScope } }).catch(() => undefined);
        await prisma.imagingRequest.deleteMany({ where: clinicScope }).catch(() => undefined);
        await prisma.labResultParameter.deleteMany({ where: { labResult: { labRequest: clinicScope } } }).catch(() => undefined);
        await prisma.labResult.deleteMany({ where: { labRequest: clinicScope } }).catch(() => undefined);
        await prisma.labRequest.deleteMany({ where: clinicScope }).catch(() => undefined);
        await prisma.payment.deleteMany({ where: clinicScope }).catch(() => undefined);
        await prisma.invoice.deleteMany({ where: clinicScope }).catch(() => undefined);
        await prisma.patient.deleteMany({ where: clinicScope }).catch(() => undefined);
        await prisma.subscriptionCompany.deleteMany({ where: clinicScope }).catch(() => undefined);
        await prisma.stockLot.deleteMany({ where: clinicScope }).catch(() => undefined);
        await prisma.operatingRoom.deleteMany({ where: clinicScope }).catch(() => undefined);
        await prisma.imagingCatalogue.deleteMany({ where: clinicScope }).catch(() => undefined);
        await prisma.serviceUnit.deleteMany({ where: clinicScope }).catch(() => undefined);
        await prisma.service.deleteMany({ where: clinicScope }).catch(() => undefined);
        await prisma.department.deleteMany({ where: clinicScope }).catch(() => undefined);
        await prisma.user.deleteMany({ where: { email: { contains: suffix } } }).catch(() => undefined);
        await prisma.platformLayerConfiguration.deleteMany({ where: clinicScope }).catch(() => undefined);
        await prisma.clinic.deleteMany({ where: { id: clinicId } }).catch(() => undefined);
      }
      await prisma.labTestParameter.deleteMany({ where: { code: `GLU-P-${suffix}` } }).catch(() => undefined);
      await prisma.labTest.deleteMany({ where: { code: `GLU-${suffix}` } }).catch(() => undefined);
      await prisma.labCategory.deleteMany({ where: { code: `BIO-${suffix}` } }).catch(() => undefined);
      await prisma.labSection.deleteMany({ where: { name: `Lab ${suffix}` } }).catch(() => undefined);
      await prisma.medication.deleteMany({ where: { code: `PARA-${suffix}` } }).catch(() => undefined);
      await prisma.medicationCategory.deleteMany({ where: { code: `ANT-${suffix}` } }).catch(() => undefined);
      await prisma.medicationSection.deleteMany({ where: { code: `MEDSEC-${suffix}` } }).catch(() => undefined);
      await prisma.$disconnect();
    }
  },
);
