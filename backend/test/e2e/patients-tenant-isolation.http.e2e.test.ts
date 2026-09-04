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
  PatientWorkflowStatus,
  PrismaClient,
  RoleSlug,
} from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { AuthService } from '../../src/auth/auth.service';

const databaseUrl = process.env.TEST_DATABASE_URL;

type TestUser = {
  id: string;
  email: string;
  username: string;
  displayName: string;
  primaryRole: string | null;
  status?: string;
};

const loginCookies = async (
  authService: AuthService,
  user: TestUser,
) => {
  const session = await authService.login({
    id: user.id,
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    primaryRole: user.primaryRole,
    status: user.status,
  });

  return [`aulia_access_token=${session.accessToken}`];
};

/**
 * Regression coverage for AC-P002.
 *
 * It deliberately exercises the HTTP boundary so a future
 * controller signature regression cannot widen a tenant
 * scope silently.
 */
test(
  'HTTP E2E AC-P002: les opérations Patients restent isolées par clinique',
  {
    skip: !databaseUrl,
  },
  async () => {
    if (!databaseUrl) {
      return;
    }

    const suffix = randomUUID().slice(0, 12);
    const password = 'AC-P002-Strong-Password-2026!';

    const prisma = new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl,
        },
      },
    });

    let app: INestApplication | undefined;
    let clinicAId: string | undefined;
    let clinicBId: string | undefined;

    try {
      process.env.DATABASE_URL = databaseUrl;
      process.env.JWT_SECRET ??= 'ac_p002_access_secret';
      process.env.JWT_REFRESH_SECRET ??= 'ac_p002_refresh_secret';
      process.env.CORS_ORIGIN ??= 'http://localhost:5173';

      const [clinicA, clinicB] = await Promise.all([
        prisma.clinic.create({
          data: {
            name: `AC-P002 A ${suffix}`,
          },
        }),

        prisma.clinic.create({
          data: {
            name: `AC-P002 B ${suffix}`,
          },
        }),
      ]);

      clinicAId = clinicA.id;
      clinicBId = clinicB.id;

      await prisma.platformLayerConfiguration.createMany({
        data: [
          {
            clinicId: clinicA.id,
            enabledLayers: [AuliaLayer.CORE],
            configuredAt: new Date(),
            configurationVersion: 1,
          },
          {
            clinicId: clinicB.id,
            enabledLayers: [AuliaLayer.CORE],
            configuredAt: new Date(),
            configurationVersion: 1,
          },
        ],
      });

      const passwordHash = await bcrypt.hash(password, 10);

      const createUser = (
        clinicId: string | null,
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
            primaryRole: true,
            status: true,
          },
        });

      const [
        receptionA,
        cashierA,
        cashierB,
        nurseA,
        doctorA,
        physicianB,
        adminA,
        noClinicReception,
      ] = await Promise.all([
        createUser(
          clinicA.id,
          RoleSlug.RECEPTIONIST,
          'reception-a',
        ),

        createUser(
          clinicA.id,
          RoleSlug.CASHIER,
          'cashier-a',
        ),

        createUser(
          clinicB.id,
          RoleSlug.CASHIER,
          'cashier-b',
        ),

        createUser(
          clinicA.id,
          RoleSlug.NURSE,
          'nurse-a',
        ),

        createUser(
          clinicA.id,
          RoleSlug.PHYSICIAN,
          'doctor-a',
        ),

        createUser(
          clinicB.id,
          RoleSlug.PHYSICIAN,
          'doctor-b',
        ),

        createUser(
          clinicA.id,
          RoleSlug.ADMIN,
          'admin-a',
        ),

        createUser(
          null,
          RoleSlug.RECEPTIONIST,
          'legacy-reception',
        ),
      ]);

      const [serviceA, serviceB] = await Promise.all([
        prisma.service.create({
          data: {
            clinicId: clinicA.id,
            active: true,
            name: `Consultation Generale - Reception A ${suffix}`,
          },
        }),

        prisma.service.create({
          data: {
            clinicId: clinicB.id,
            active: true,
            name: `Consultation Generale - Reception B ${suffix}`,
          },
        }),
      ]);

      await prisma.serviceTarif.createMany({
        data: [
          {
            serviceId: serviceA.id,
            prix: 25000,
            actif: true,
          },
          {
            serviceId: serviceB.id,
            prix: 25000,
            actif: true,
          },
        ],
      });

      const [patientA, patientB] = await Promise.all([
        prisma.patient.create({
          data: {
            clinicId: clinicA.id,
            receptionistId: receptionA.id,
            serviceId: serviceA.id,
            firstName: 'Patient',
            lastName: `A-${suffix}`,
            gender: 'OTHER',
            dateOfBirth: new Date(
              '1990-01-01T00:00:00.000Z',
            ),
            workflowStatus:
              PatientWorkflowStatus.EN_ATTENTE_INFIRMERIE,
          },
        }),

        prisma.patient.create({
          data: {
            clinicId: clinicB.id,
            serviceId: serviceB.id,
            firstName: 'Patient',
            lastName: `B-${suffix}`,
            gender: 'OTHER',
            dateOfBirth: new Date(
              '1991-01-01T00:00:00.000Z',
            ),
            workflowStatus:
              PatientWorkflowStatus.EN_ATTENTE_INFIRMERIE,
          },
        }),
      ]);

      const [invoiceA, invoiceB] = await Promise.all([
        prisma.invoice.create({
          data: {
            clinicId: clinicA.id,
            patientId: patientA.id,
            issuedById: receptionA.id,
            totalAmount: 25000,
            balanceDue: 25000,
            type: 'ADMISSION_FEE',
          },
        }),

        prisma.invoice.create({
          data: {
            clinicId: clinicB.id,
            patientId: patientB.id,
            issuedById: physicianB.id,
            totalAmount: 25000,
            balanceDue: 25000,
            type: 'ADMISSION_FEE',
          },
        }),
      ]);

      await prisma.patientVisit.createMany({
        data: [
          {
            clinicId: clinicA.id,
            patientId: patientA.id,
            receptionistId: receptionA.id,
            invoiceId: invoiceA.id,
            serviceId: serviceA.id,
            visitType: 'ADMISSION',
            status: 'AWAITING_PAYMENT',
          },
          {
            clinicId: clinicB.id,
            patientId: patientB.id,
            invoiceId: invoiceB.id,
            serviceId: serviceB.id,
            visitType: 'ADMISSION',
            status: 'AWAITING_PAYMENT',
          },
        ],
      });

      await prisma.medicalHistory.create({
        data: {
          patientId: patientB.id,
          kind: 'NURSE_ORIENTATION',
          details: JSON.stringify({
            physicianId: physicianB.id,
            physicianName: 'Doctor B',
          }),
          createdById: physicianB.id,
        },
      });

      const sameEmail =
        `portal-unlinked-${suffix}@e2e.local`;

      const portalUser = await prisma.user.create({
        data: {
          email: sameEmail,
          username: `portal-unlinked-${suffix}`,
          displayName: 'Portail non lié',
          firstName: 'Portail',
          lastName: 'Non lié',
          passwordHash,
          primaryRole: RoleSlug.PATIENT,
        },
        select: {
          id: true,
          email: true,
          username: true,
          displayName: true,
          primaryRole: true,
          status: true,
        },
      });

      await prisma.patient.create({
        data: {
          clinicId: clinicA.id,
          firstName: 'Même',
          lastName: `Email-${suffix}`,
          email: sameEmail,
          gender: 'OTHER',
          dateOfBirth: new Date(
            '1992-01-01T00:00:00.000Z',
          ),
        },
      });

      /*
       * AC-P002 teste l'isolation tenant des opérations Patients.
       * Les sessions de test sont créées directement via AuthService
       * afin de conserver de vrais JWT et de vraies sessions en base
       * sans déclencher artificiellement le rate limiting de /auth/login.
       */
      const moduleRef = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();

      const authService = moduleRef.get(AuthService);

      app = moduleRef.createNestApplication();

      app.setGlobalPrefix('api');

      app.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
        }),
      );

      await app.init();

      /*
       * Les sessions sont créées séquentiellement pour garder
       * le setup déterministe. Les requêtes Patients restent,
       * elles, exercées à travers la vraie frontière HTTP.
       */
      const receptionCookies =
        await loginCookies(authService, receptionA);

      const cashierCookies =
        await loginCookies(authService, cashierA);

      const nurseCookies =
        await loginCookies(authService, nurseA);

      const doctorCookies =
        await loginCookies(authService, doctorA);

      const adminCookies =
        await loginCookies(authService, adminA);

      const portalCookies =
        await loginCookies(authService, portalUser);

      const noClinicCookies =
        await loginCookies(authService, noClinicReception);

      /*
       * Un utilisateur opérationnel sans clinique
       * doit échouer fermé.
       */
      await request(app.getHttpServer())
        .get('/api/patients')
        .set(
          'Cookie',
          noClinicCookies,
        )
        .expect(403);

      /*
       * Réception A ne peut pas lire le dossier B.
       */
      await request(app.getHttpServer())
        .get(
          `/api/patients/${patientB.id}`,
        )
        .set(
          'Cookie',
          receptionCookies,
        )
        .expect(404);

      /*
       * Recherche patient tenant-scopée.
       */
      await request(app.getHttpServer())
        .get(
          `/api/patients/search?name=${encodeURIComponent(
            `B-${suffix}`,
          )}`,
        )
        .set(
          'Cookie',
          receptionCookies,
        )
        .expect(200)
        .expect(({ body }) => {
          assert.equal(
            body.some(
              (patient: {
                id: string;
              }) =>
                patient.id === patientB.id,
            ),
            false,
          );
        });

      /*
       * Mise à jour inter-clinique interdite.
       */
      await request(app.getHttpServer())
        .patch(
          `/api/patients/${patientB.id}`,
        )
        .set(
          'Cookie',
          receptionCookies,
        )
        .send({
          address:
            'Cross clinic forbidden',
        })
        .expect(404);

      /*
       * Suppression inter-clinique interdite.
       */
      await request(app.getHttpServer())
        .delete(
          `/api/patients/${patientB.id}`,
        )
        .set(
          'Cookie',
          adminCookies,
        )
        .expect(404);

      /*
       * La caisse A ne doit jamais voir
       * les patients en attente de paiement B.
       */
      await request(app.getHttpServer())
        .get(
          '/api/patients/cashier/awaiting-payment',
        )
        .set(
          'Cookie',
          cashierCookies,
        )
        .expect(200)
        .expect(({ body }) => {
          assert.equal(
            body.some(
              (patient: {
                id: string;
              }) =>
                patient.id === patientB.id,
            ),
            false,
          );
        });

      /*
       * L'infirmier A ne voit pas
       * les patients B en attente de constantes.
       */
      await request(app.getHttpServer())
        .get(
          '/api/patients/nurse/awaiting-vitals',
        )
        .set(
          'Cookie',
          nurseCookies,
        )
        .expect(200)
        .expect(({ body }) => {
          assert.equal(
            body.some(
              (patient: {
                id: string;
              }) =>
                patient.id === patientB.id,
            ),
            false,
          );
        });

      /*
       * Historique d'orientation tenant-scopé.
       */
      await request(app.getHttpServer())
        .get(
          '/api/patients/nurse/orientation-history?period=all',
        )
        .set(
          'Cookie',
          nurseCookies,
        )
        .expect(200)
        .expect(({ body }) => {
          assert.equal(
            body.some(
              (entry: {
                patientId: string;
              }) =>
                entry.patientId ===
                patientB.id,
            ),
            false,
          );
        });

      /*
       * L'infirmier A ne peut pas écrire
       * les constantes du patient B.
       */
      await request(app.getHttpServer())
        .post(
          `/api/patients/${patientB.id}/vital-signs`,
        )
        .set(
          'Cookie',
          nurseCookies,
        )
        .send({
          temperature: '37.2',
        })
        .expect(404);

      /*
       * Même pour un patient A,
       * un médecin B ne peut pas être injecté
       * comme destinataire/responsable.
       */
      await request(app.getHttpServer())
        .post(
          `/api/patients/${patientA.id}/vital-signs`,
        )
        .set(
          'Cookie',
          nurseCookies,
        )
        .send({
          temperature: '37.2',
          physicianId: physicianB.id,
        })
        .expect(403);

      /*
       * Réadmission d'un patient B depuis A interdite.
       */
      await request(app.getHttpServer())
        .post(
          '/api/patients/admissions',
        )
        .set(
          'Cookie',
          receptionCookies,
        )
        .send({
          existingPatientId:
            patientB.id,
          firstName:
            patientB.firstName,
          lastName:
            patientB.lastName,
          gender:
            patientB.gender,
          dateOfBirth:
            patientB.dateOfBirth.toISOString(),
          admissionType:
            'CLASSIQUE',
          billingServiceId:
            serviceA.id,
        })
        .expect(404);

      /*
       * Médecin A ne lit pas le dossier B.
       */
      await request(app.getHttpServer())
        .get(
          `/api/patients/${patientB.id}`,
        )
        .set(
          'Cookie',
          doctorCookies,
        )
        .expect(403);

      /*
       * Patients assignés au médecin A :
       * aucun patient B.
       */
      await request(app.getHttpServer())
        .get(
          '/api/patients/doctor/assigned',
        )
        .set(
          'Cookie',
          doctorCookies,
        )
        .expect(200)
        .expect(({ body }) => {
          assert.equal(
            body.some(
              (patient: {
                id: string;
              }) =>
                patient.id === patientB.id,
            ),
            false,
          );
        });

      /*
       * Un compte portail qui possède le même e-mail
       * qu'un patient ne doit jamais être lié automatiquement.
       */
      await request(app.getHttpServer())
        .get(
          '/api/patients/me/profile',
        )
        .set(
          'Cookie',
          portalCookies,
        )
        .expect(404);

      const unlinkedPortalCount =
        await prisma.patient.count({
          where: {
            portalUserId:
              portalUser.id,
          },
        });

      assert.equal(
        unlinkedPortalCount,
        0,
        'un e-mail identique ne doit jamais créer une liaison portail',
      );

      /*
       * Admission normale Clinic A.
       *
       * Elle permet aussi de vérifier que
       * les notifications de caisse restent
       * dans le bon tenant.
       */
      const admission =
        await request(app.getHttpServer())
          .post(
            '/api/patients/admissions',
          )
          .set(
            'Cookie',
            receptionCookies,
          )
          .send({
            firstName:
              'Admission',
            lastName:
              `A-${suffix}`,
            gender:
              'OTHER',
            dateOfBirth:
              '1993-01-01T00:00:00.000Z',
            email:
              `admission-${suffix}@e2e.local`,
            admissionType:
              'CLASSIQUE',
            billingServiceId:
              serviceA.id,
          })
          .expect(201);

      const admittedInvoiceId =
        admission.body.invoice.id as string;

      const notificationToClinicA =
        await prisma.notification.count({
          where: {
            recipientId:
              cashierA.id,
            relatedId:
              admittedInvoiceId,
          },
        });

      assert.equal(
        notificationToClinicA,
        1,
        'la caisse du même établissement reçoit la notification',
      );

      const notificationToClinicB =
        await prisma.notification.count({
          where: {
            recipientId:
              cashierB.id,
            relatedId:
              admittedInvoiceId,
          },
        });

      assert.equal(
        notificationToClinicB,
        0,
        'une notification d’admission ne traverse pas les cliniques',
      );
    } finally {
      if (app) {
        await app.close();
      }

      const clinicIds = [
        clinicAId,
        clinicBId,
      ].filter(
        (id): id is string =>
          Boolean(id),
      );

      await prisma.session
        .deleteMany({
          where: {
            user: {
              email: {
                contains: suffix,
              },
            },
          },
        })
        .catch(() => undefined);

      await prisma.loginAttempt
        .deleteMany({
          where: {
            username: {
              contains: suffix,
            },
          },
        })
        .catch(() => undefined);

      await prisma.notification
        .deleteMany({
          where: {
            recipient: {
              email: {
                contains: suffix,
              },
            },
          },
        })
        .catch(() => undefined);

      await prisma.patient
        .deleteMany({
          where: {
            clinicId: {
              in: clinicIds,
            },
          },
        })
        .catch(() => undefined);

      await prisma.user
        .deleteMany({
          where: {
            email: {
              contains: suffix,
            },
          },
        })
        .catch(() => undefined);

      await prisma.service
        .deleteMany({
          where: {
            clinicId: {
              in: clinicIds,
            },
          },
        })
        .catch(() => undefined);

      await prisma.platformLayerConfiguration
        .deleteMany({
          where: {
            clinicId: {
              in: clinicIds,
            },
          },
        })
        .catch(() => undefined);

      await prisma.clinic
        .deleteMany({
          where: {
            id: {
              in: clinicIds,
            },
          },
        })
        .catch(() => undefined);

      await prisma.$disconnect();
    }
  },
);