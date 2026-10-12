import assert from 'node:assert/strict';
import test from 'node:test';
import { AuliaLayer, PrismaClient, RoleSlug } from '@prisma/client';
import {
  DEMO_PATIENTS,
  DEMO_USERS,
  assertDemoSeedPreflight,
  runDemoSeed,
} from '../../prisma/seed-demo';
import {
  assertDemoDatabaseConnection,
  resolveDemoDatabaseTarget,
} from '../../src/core/app-mode';

const databaseUrl = process.env.AULIA_DEMO_TEST_DATABASE_URL;
const databaseName = process.env.AULIA_DEMO_TEST_DATABASE_NAME;
const databaseUser = process.env.AULIA_DEMO_TEST_DATABASE_USER;
const sentinel = process.env.AULIA_DEMO_TEST_DATABASE_SENTINEL;
const confirmation = process.env.AULIA_DEMO_TEST_CONFIRM;

const requireTestConfiguration = () => {
  if (!databaseUrl || !databaseName || !databaseUser || !sentinel || confirmation !== 'ISOLATED_POSTGRES_ONLY') {
    throw new Error('AULIA_DEMO_TEST_DATABASE_URL, AULIA_DEMO_TEST_DATABASE_NAME, AULIA_DEMO_TEST_DATABASE_USER, AULIA_DEMO_TEST_DATABASE_SENTINEL and AULIA_DEMO_TEST_CONFIRM=ISOLATED_POSTGRES_ONLY are required for test:demo-seed.');
  }
  if (!/^[a-z][a-z0-9_]{2,62}$/i.test(databaseName)
    || !/^[a-z][a-z0-9_]{2,62}$/i.test(databaseUser)
    || sentinel.length < 24) {
    throw new Error('DEMO test database configuration is invalid.');
  }
  return { databaseUrl, databaseName, databaseUser, sentinel };
};

test('demo seed verifies its real PostgreSQL target and preserves isolation', async () => {
  const config = requireTestConfiguration();
  const environment = {
    AULIA_APP_MODE: 'demo',
    AULIA_DEMO_SEED_CONFIRM: 'true',
    AULIA_DEMO_PASSWORD: 'DemoPasswordOnly-2026',
    DATABASE_URL: config.databaseUrl,
    AULIA_DEMO_DATABASE_NAME: config.databaseName,
    AULIA_DEMO_DATABASE_USER: config.databaseUser,
    AULIA_DEMO_DATABASE_SENTINEL: config.sentinel,
  };
  const prisma = new PrismaClient({ datasources: { db: { url: config.databaseUrl } } });
  try {
    // The sentinel is provisioned outside this test with the isolated DB.
    // Verify the actual Prisma target and reject business data before this
    // test writes even harmless global reference fixtures.
    await assertDemoDatabaseConnection(prisma, resolveDemoDatabaseTarget(environment));
    await assertDemoSeedPreflight(prisma);

    // Canonical roles and the unrelated catalogue fixture are provisioned
    // outside this test, on the dedicated disposable integration database.
    // The seed test must never manufacture or mutate global reference data.
    const globalSection = await prisma.medicationSection.findUnique({
      where: { code: 'TEST-GLOBAL-UNCHANGED' },
    });
    assert.ok(globalSection, 'isolated integration database must provide TEST-GLOBAL-UNCHANGED');
    const rolesBefore = await prisma.role.findMany({
      where: { slug: { in: DEMO_USERS.map((user) => user.role) } },
      select: { slug: true, name: true, description: true, updatedAt: true },
      orderBy: { slug: 'asc' },
    });
    const globalBefore = {
      name: globalSection.name,
      active: globalSection.active,
      updatedAt: globalSection.updatedAt,
    };
      await assert.rejects(
        () => runDemoSeed(prisma, {
          ...environment,
          DATABASE_URL: config.databaseUrl.replace(config.databaseName, config.databaseName + '_alias'),
          AULIA_DEMO_DATABASE_NAME: config.databaseName + '_alias',
        }),
        /connexion Prisma reelle/,
      );

      const first = await runDemoSeed(prisma, environment);
      const beforeSecond = await Promise.all([
        prisma.user.findMany({ where: { clinicId: first.clinicId }, select: { id: true }, orderBy: { id: 'asc' } }),
        prisma.employee.findMany({ where: { clinicId: first.clinicId }, select: { id: true }, orderBy: { id: 'asc' } }),
        prisma.patient.findMany({ where: { clinicId: first.clinicId }, select: { id: true }, orderBy: { id: 'asc' } }),
        Promise.all([
          prisma.user.count({ where: { clinicId: first.clinicId } }),
          prisma.employee.count({ where: { clinicId: first.clinicId } }),
          prisma.patient.count({ where: { clinicId: first.clinicId } }),
          prisma.appointment.count({ where: { clinicId: first.clinicId } }),
          prisma.consultation.count({ where: { clinicId: first.clinicId } }),
          prisma.labRequest.count({ where: { clinicId: first.clinicId } }),
          prisma.prescription.count({ where: { clinicId: first.clinicId } }),
          prisma.invoice.count({ where: { clinicId: first.clinicId } }),
        ]),
      ]);
      const second = await runDemoSeed(prisma, environment);
      assert.equal(second.clinicId, first.clinicId);

      const [configuration, users, employees, patients, rolesAfter, globalAfter, counts] = await Promise.all([
        prisma.platformLayerConfiguration.findUnique({ where: { clinicId: first.clinicId } }),
        prisma.user.findMany({ where: { username: { in: DEMO_USERS.map((user) => user.username) } } }),
        prisma.employee.findMany({ where: { clinicId: first.clinicId, employeeNumber: { startsWith: 'DEMO-EMP-' } } }),
        prisma.patient.findMany({ where: { externalId: { in: DEMO_PATIENTS.map((patient) => patient.externalId) } } }),
        prisma.role.findMany({
          where: { slug: { in: DEMO_USERS.map((user) => user.role) } },
          select: { slug: true, name: true, description: true, updatedAt: true },
          orderBy: { slug: 'asc' },
        }),
        prisma.medicationSection.findUnique({ where: { code: 'TEST-GLOBAL-UNCHANGED' } }),
        Promise.all([
          prisma.user.count({ where: { clinicId: first.clinicId } }),
          prisma.employee.count({ where: { clinicId: first.clinicId } }),
          prisma.patient.count({ where: { clinicId: first.clinicId } }),
          prisma.appointment.count({ where: { clinicId: first.clinicId } }),
          prisma.consultation.count({ where: { clinicId: first.clinicId } }),
          prisma.labRequest.count({ where: { clinicId: first.clinicId } }),
          prisma.prescription.count({ where: { clinicId: first.clinicId } }),
          prisma.invoice.count({ where: { clinicId: first.clinicId } }),
        ]),
      ]);
      assert.deepEqual(configuration?.enabledLayers, [AuliaLayer.CORE]);
      assert.equal(users.length, DEMO_USERS.length);
      assert.equal(users.every((user) => user.clinicId === first.clinicId && user.primaryRole !== RoleSlug.DEV), true);
      assert.equal(employees.length, DEMO_USERS.length);
      assert.equal(employees.every((employee) => employee.clinicId === first.clinicId), true);
      assert.equal(patients.length, DEMO_PATIENTS.length);
      assert.equal(patients.every((patient) => patient.clinicId === first.clinicId), true);
      assert.deepEqual(rolesAfter, rolesBefore);
      assert.deepEqual(globalAfter && {
        name: globalAfter.name,
        active: globalAfter.active,
        updatedAt: globalAfter.updatedAt,
      }, globalBefore);

      const afterSecond = await Promise.all([
        prisma.user.findMany({ where: { clinicId: first.clinicId }, select: { id: true }, orderBy: { id: 'asc' } }),
        prisma.employee.findMany({ where: { clinicId: first.clinicId }, select: { id: true }, orderBy: { id: 'asc' } }),
        prisma.patient.findMany({ where: { clinicId: first.clinicId }, select: { id: true }, orderBy: { id: 'asc' } }),
        Promise.all([
          prisma.user.count({ where: { clinicId: first.clinicId } }),
          prisma.employee.count({ where: { clinicId: first.clinicId } }),
          prisma.patient.count({ where: { clinicId: first.clinicId } }),
          prisma.appointment.count({ where: { clinicId: first.clinicId } }),
          prisma.consultation.count({ where: { clinicId: first.clinicId } }),
          prisma.labRequest.count({ where: { clinicId: first.clinicId } }),
          prisma.prescription.count({ where: { clinicId: first.clinicId } }),
          prisma.invoice.count({ where: { clinicId: first.clinicId } }),
        ]),
      ]);
      assert.deepEqual(afterSecond[0], beforeSecond[0]);
      assert.deepEqual(afterSecond[1], beforeSecond[1]);
      assert.deepEqual(afterSecond[2], beforeSecond[2]);
      assert.deepEqual(afterSecond[3], beforeSecond[3]);
      assert.deepEqual(counts, beforeSecond[3]);

      const foreignClinic = await prisma.clinic.create({
        data: {
          name: 'Temporary collision clinic',
          legalName: 'Temporary collision clinic',
          establishmentType: 'CLINIC',
          country: 'DRC',
          city: 'Lubumbashi',
          timezone: 'Africa/Lubumbashi',
          currency: 'CDF',
          status: 'ACTIVE',
        },
      });
      try {
        await assert.rejects(() => runDemoSeed(prisma, environment), /identified DEMO fixture/);
      } finally {
        await prisma.clinic.delete({ where: { id: foreignClinic.id } });
      }

      const section = await prisma.medicationSection.findUniqueOrThrow({
        where: { code: 'DEMO-MED' },
      });
      const beforeFailure = await Promise.all([
        prisma.clinic.count(),
        prisma.user.count(),
        prisma.employee.count(),
        prisma.patient.count(),
        prisma.appointment.count(),
        prisma.consultation.count(),
        prisma.labRequest.count(),
        prisma.prescription.count(),
        prisma.invoice.count(),
      ]);
      await prisma.medicationSection.update({
        where: { id: section.id },
        data: { name: 'Collision deliberately introduced by the isolated test' },
      });
      try {
        await assert.rejects(() => runDemoSeed(prisma, environment), /medication section collides/);
        const afterFailure = await Promise.all([
          prisma.clinic.count(),
          prisma.user.count(),
          prisma.employee.count(),
          prisma.patient.count(),
          prisma.appointment.count(),
          prisma.consultation.count(),
          prisma.labRequest.count(),
          prisma.prescription.count(),
          prisma.invoice.count(),
        ]);
        assert.deepEqual(afterFailure, beforeFailure);
      } finally {
        await prisma.medicationSection.update({
          where: { id: section.id },
          data: { name: 'DEMO Medications' },
        });
      }
  } finally {
    await prisma.$disconnect();
  }
});
