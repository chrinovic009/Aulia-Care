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
  BedStatus,
  DepartmentType,
  InvoiceStatus,
  InvoiceType,
  PrismaClient,
  RoleSlug,
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
 * Exercises two safety boundaries which were previously only represented by
 * direct Prisma tests: a clinical discharge must release its bed atomically,
 * and laboratory critical-value alerts must never leave their clinic.
 */
test(
  'HTTP E2E Core: sortie libère le lit et les alertes laboratoire restent dans leur établissement',
  { skip: !databaseUrl },
  async () => {
    if (!databaseUrl) return;

    const suffix = randomUUID().slice(0, 12);
    const password = 'Core-Resource-Boundaries-2026!';
    const prisma = new PrismaClient({
      datasources: { db: { url: databaseUrl } },
    });
    let app: INestApplication | undefined;
    let clinicAId: string | undefined;
    let clinicBId: string | undefined;

    try {
      process.env.DATABASE_URL = databaseUrl;
      process.env.JWT_SECRET ??= 'core_resource_boundaries_access_secret';
      process.env.JWT_REFRESH_SECRET ??=
        'core_resource_boundaries_refresh_secret';
      process.env.CORS_ORIGIN ??= 'http://localhost:5173';

      const [clinicA, clinicB] = await Promise.all([
        prisma.clinic.create({ data: { name: `Core resource A ${suffix}` } }),
        prisma.clinic.create({ data: { name: `Core resource B ${suffix}` } }),
      ]);
      clinicAId = clinicA.id;
      clinicBId = clinicB.id;

      await prisma.platformLayerConfiguration.createMany({
        data: [clinicA.id, clinicB.id].map((clinicId) => ({
          clinicId,
          enabledLayers: [AuliaLayer.CORE],
          configuredAt: new Date(),
          configurationVersion: 1,
        })),
      });

      const passwordHash = await bcrypt.hash(password, 10);
      const createUser = (
        clinicId: string,
        role: RoleSlug,
        label: string,
      ) =>
        prisma.user.create({
          data: {
            clinicId,
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

      const [doctorA, nurseA, nurseB, labManagerA, labManagerB] =
        await Promise.all([
          createUser(clinicA.id, RoleSlug.PHYSICIAN, 'doctor-a'),
          createUser(clinicA.id, RoleSlug.NURSE, 'nurse-a'),
          createUser(clinicB.id, RoleSlug.NURSE, 'nurse-b'),
          createUser(clinicA.id, RoleSlug.LAB_MANAGER, 'lab-manager-a'),
          createUser(clinicB.id, RoleSlug.LAB_MANAGER, 'lab-manager-b'),
        ]);

      const [departmentA, departmentB] = await Promise.all([
        prisma.department.create({
          data: {
            clinicId: clinicA.id,
            name: `Hospitalisation A ${suffix}`,
            code: `HOSP-A-${suffix}`,
            type: DepartmentType.MEDICAL,
          },
        }),
        prisma.department.create({
          data: {
            clinicId: clinicB.id,
            name: `Hospitalisation B ${suffix}`,
            code: `HOSP-B-${suffix}`,
            type: DepartmentType.MEDICAL,
          },
        }),
      ]);

      const [unitA, unitB] = await Promise.all([
        prisma.serviceUnit.create({
          data: {
            clinicId: clinicA.id,
            departmentId: departmentA.id,
            name: `Unité A ${suffix}`,
          },
        }),
        prisma.serviceUnit.create({
          data: {
            clinicId: clinicB.id,
            departmentId: departmentB.id,
            name: `Unité B ${suffix}`,
          },
        }),
      ]);

      await prisma.employee.create({
        data: {
          userId: nurseA.id,
          clinicId: clinicA.id,
          firstName: nurseA.firstName,
          lastName: nurseA.lastName,
          status: 'ACTIVE',
          serviceUnitId: unitA.id,
          shiftPattern: 'PERMANENT_DAY',
        },
      });
      await prisma.employee.create({
        data: {
          userId: nurseB.id,
          clinicId: clinicB.id,
          firstName: nurseB.firstName,
          lastName: nurseB.lastName,
          status: 'ACTIVE',
          serviceUnitId: unitB.id,
        },
      });

      const roomA = await prisma.room.create({
        data: {
          number: `ROOM-${suffix}`,
          name: 'Salle de surveillance E2E',
          location: 'Aile médicale',
          serviceUnitId: unitA.id,
        },
      });
      const bedA = await prisma.bed.create({
        data: {
          roomId: roomA.id,
          code: `BED-${suffix}`,
          status: BedStatus.FREE,
        },
      });

      const patientA = await prisma.patient.create({
        data: {
          clinicId: clinicA.id,
          firstName: 'Patient',
          lastName: `Core-${suffix}`,
          gender: 'OTHER',
          dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
        },
      });
      const appointment = await prisma.appointment.create({
        data: {
          clinicId: clinicA.id,
          patientId: patientA.id,
          requestedById: doctorA.id,
          scheduledAt: new Date(),
          durationMinutes: 30,
          reason: 'Fixture clinique E2E',
          status: 'CHECKED_IN',
        },
      });
      const consultation = await prisma.consultation.create({
        data: {
          clinicId: clinicA.id,
          patientId: patientA.id,
          appointmentId: appointment.id,
          providerId: doctorA.id,
          status: 'IN_PROGRESS',
          chiefComplaint: 'Surveillance clinique',
        },
      });

      const labSection = await prisma.labSection.create({
        data: { name: `Section ${suffix}` },
      });
      const labCategory = await prisma.labCategory.create({
        data: {
          sectionId: labSection.id,
          name: `Catégorie ${suffix}`,
          code: `CAT-${suffix}`,
        },
      });
      const labTest = await prisma.labTest.create({
        data: {
          code: `LAB-${suffix}`,
          name: `Examen ${suffix}`,
          categoryId: labCategory.id,
          sectionId: labSection.id,
          price: 1_000,
        },
      });
      const labParameter = await prisma.labTestParameter.create({
        data: {
          labTestId: labTest.id,
          code: `P-${suffix}`,
          name: 'Paramètre critique E2E',
          criticalHigh: 10,
        },
      });
      const labInvoice = await prisma.invoice.create({
        data: {
          clinicId: clinicA.id,
          patientId: patientA.id,
          issuedById: doctorA.id,
          type: InvoiceType.LABORATORY,
          status: InvoiceStatus.PAID,
          totalAmount: 1_000,
          balanceDue: 0,
          remarks: `LabRequest:pending-${suffix}`,
        },
      });
      const labRequest = await prisma.labRequest.create({
        data: {
          clinicId: clinicA.id,
          consultationId: consultation.id,
          patientId: patientA.id,
          requestedById: doctorA.id,
          externalReference: labInvoice.id,
          specimenType: 'Sang',
          status: 'REQUESTED',
        },
      });
      const medicationSection = await prisma.medicationSection.create({
        data: { name: `Section médicaments ${suffix}`, code: `MEDS-${suffix}` },
      });
      const medicationCategory = await prisma.medicationCategory.create({
        data: {
          sectionId: medicationSection.id,
          name: `Catégorie médicaments ${suffix}`,
          code: `MEDCAT-${suffix}`,
        },
      });
      const medication = await prisma.medication.create({
        data: {
          categoryId: medicationCategory.id,
          code: `MED-${suffix}`,
          name: 'Médicament réservé à la clinique B',
          unit: 'comprimé',
        },
      });
      await prisma.stockLot.create({
        data: {
          medicationId: medication.id,
          clinicId: clinicB.id,
          batchNumber: `LOT-B-${suffix}`,
          quantity: 20,
          purchasePrice: 500,
        },
      });

      const moduleRef = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      const auth = moduleRef.get(AuthService);
      app = moduleRef.createNestApplication();
      app.setGlobalPrefix('api');
      app.useGlobalPipes(
        new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
      );
      await app.init();
      const server = app.getHttpServer();
      const doctorCookies = await cookiesFor(auth, doctorA);
      const labManagerCookies = await cookiesFor(auth, labManagerA);

      // The availability endpoint exercises the batch scheduling path. The
      // permanent day nurse must be returned for its own clinic and unit.
      const availableNurses = await request(server)
        .get(`/api/hospitalizations/nurse/available?serviceUnitId=${unitA.id}`)
        .set('Cookie', doctorCookies)
        .expect(200);
      assert.ok(
        availableNurses.body.some(
          (item: { id: string; coverage: string }) =>
            item.id === nurseA.id && item.coverage === 'DAY',
        ),
      );

      // Stock in clinic B must never make the same shared medication
      // prescribable for a patient in clinic A.
      await request(server)
        .post(`/api/consultations/${consultation.id}/prescriptions`)
        .set('Cookie', doctorCookies)
        .send({ lines: [{ medicationId: medication.id, quantity: 1 }] })
        .expect(400);

      const hospitalization = await request(server)
        .post('/api/hospitalizations')
        .set('Cookie', doctorCookies)
        .send({
          consultationId: consultation.id,
          patientId: patientA.id,
          serviceUnitId: unitA.id,
          bedId: bedA.id,
          admissionReason: 'Surveillance postopératoire',
        })
        .expect(201);

      await request(server)
        .patch(`/api/hospitalizations/${hospitalization.body.id}`)
        .set('Cookie', doctorCookies)
        .send({ serviceUnitId: unitB.id })
        .expect(404);

      await request(server)
        .patch(`/api/hospitalizations/${hospitalization.body.id}`)
        .set('Cookie', doctorCookies)
        .send({ nurseInChargeId: nurseB.id })
        .expect(404);

      await request(server)
        .patch(`/api/hospitalizations/${hospitalization.body.id}`)
        .set('Cookie', doctorCookies)
        .send({
          status: 'DISCHARGED',
          dischargeReason: 'Amélioration clinique et retour à domicile',
        })
        .expect(200);

      const [storedHospitalization, releasedBed, dischargedPatient] =
        await Promise.all([
          prisma.hospitalization.findUniqueOrThrow({
            where: { id: hospitalization.body.id },
          }),
          prisma.bed.findUniqueOrThrow({ where: { id: bedA.id } }),
          prisma.patient.findUniqueOrThrow({ where: { id: patientA.id } }),
        ]);
      assert.equal(storedHospitalization.status, 'DISCHARGED');
      assert.ok(storedHospitalization.dischargedAt);
      assert.equal(releasedBed.status, BedStatus.FREE);
      assert.equal(releasedBed.hospitalizationId, null);
      assert.equal(dischargedPatient.workflowStatus, 'TERMINE');

      await request(server)
        .post(`/api/laboratory/requests/${labRequest.id}/results`)
        .set('Cookie', labManagerCookies)
        .send({
          resultName: 'Résultat critique E2E',
          resultValue: '12',
          parameters: [
            { labTestParameterId: labParameter.id, valueNumeric: 12 },
          ],
        })
        .expect(201);

      const [managerAAlerts, managerBAlerts] = await Promise.all([
        prisma.notification.count({
          where: {
            recipientId: labManagerA.id,
            relatedEntity: 'LabCriticalAlert',
          },
        }),
        prisma.notification.count({
          where: {
            recipientId: labManagerB.id,
            relatedEntity: 'LabCriticalAlert',
          },
        }),
      ]);
      assert.equal(managerAAlerts, 1);
      assert.equal(managerBAlerts, 0);
    } finally {
      if (app) await app.close();

      const clinicIds = [clinicAId, clinicBId].filter(
        (id): id is string => Boolean(id),
      );
      await prisma.notification
        .deleteMany({ where: { recipient: { email: { contains: suffix } } } })
        .catch(() => undefined);
      await prisma.auditTrail
        .deleteMany({ where: { actor: { email: { contains: suffix } } } })
        .catch(() => undefined);
      await prisma.labCriticalAlert
        .deleteMany({ where: { patient: { clinicId: { in: clinicIds } } } })
        .catch(() => undefined);
      await prisma.labResultParameter
        .deleteMany({ where: { labResult: { labRequest: { clinicId: { in: clinicIds } } } } })
        .catch(() => undefined);
      await prisma.labResult
        .deleteMany({ where: { labRequest: { clinicId: { in: clinicIds } } } })
        .catch(() => undefined);
      await prisma.labRequest
        .deleteMany({ where: { clinicId: { in: clinicIds } } })
        .catch(() => undefined);
      await prisma.consultation
        .updateMany({
          where: { clinicId: { in: clinicIds } },
          data: { hospitalizationId: null },
        })
        .catch(() => undefined);
      await prisma.hospitalization
        .deleteMany({ where: { clinicId: { in: clinicIds } } })
        .catch(() => undefined);
      await prisma.patient
        .deleteMany({ where: { clinicId: { in: clinicIds } } })
        .catch(() => undefined);
      await prisma.bed
        .deleteMany({ where: { room: { serviceUnit: { clinicId: { in: clinicIds } } } } })
        .catch(() => undefined);
      await prisma.room
        .deleteMany({ where: { serviceUnit: { clinicId: { in: clinicIds } } } })
        .catch(() => undefined);
      await prisma.employee
        .deleteMany({ where: { clinicId: { in: clinicIds } } })
        .catch(() => undefined);
      await prisma.user
        .deleteMany({ where: { email: { contains: suffix } } })
        .catch(() => undefined);
      await prisma.serviceUnit
        .deleteMany({ where: { clinicId: { in: clinicIds } } })
        .catch(() => undefined);
      await prisma.department
        .deleteMany({ where: { clinicId: { in: clinicIds } } })
        .catch(() => undefined);
      await prisma.platformLayerConfiguration
        .deleteMany({ where: { clinicId: { in: clinicIds } } })
        .catch(() => undefined);
      await prisma.clinic
        .deleteMany({ where: { id: { in: clinicIds } } })
        .catch(() => undefined);
      await prisma.labTestParameter
        .deleteMany({ where: { labTest: { code: `LAB-${suffix}` } } })
        .catch(() => undefined);
      await prisma.labTest
        .deleteMany({ where: { code: `LAB-${suffix}` } })
        .catch(() => undefined);
      await prisma.labCategory
        .deleteMany({ where: { code: `CAT-${suffix}` } })
        .catch(() => undefined);
      await prisma.labSection
        .deleteMany({ where: { name: `Section ${suffix}` } })
        .catch(() => undefined);
      await prisma.stockLot
        .deleteMany({ where: { batchNumber: `LOT-B-${suffix}` } })
        .catch(() => undefined);
      await prisma.medication
        .deleteMany({ where: { code: `MED-${suffix}` } })
        .catch(() => undefined);
      await prisma.medicationCategory
        .deleteMany({ where: { code: `MEDCAT-${suffix}` } })
        .catch(() => undefined);
      await prisma.medicationSection
        .deleteMany({ where: { code: `MEDS-${suffix}` } })
        .catch(() => undefined);
      await prisma.$disconnect();
    }
  },
);
