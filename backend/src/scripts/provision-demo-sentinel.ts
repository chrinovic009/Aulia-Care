import { PrismaClient } from '@prisma/client';
import {
  assertDemoDatabaseIdentity,
  DEMO_DATABASE_MARKER,
  requireDemoConfirmation,
} from './demo-seed-safety';

const prisma = new PrismaClient();

async function main() {
  requireDemoConfirmation('PROVISION_DEMO_SENTINEL');
  const databaseName = await assertDemoDatabaseIdentity(prisma);

  const [clinicCount, userCount, patientCount] = await Promise.all([
    prisma.clinic.count(),
    prisma.user.count(),
    prisma.patient.count(),
  ]);

  if (clinicCount || userCount || patientCount) {
    throw new Error(
      'Refus : la base contient déjà des données métier. La sentinelle ne peut être provisionnée que sur une base DEMO vide.',
    );
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "aulia_demo_seed_sentinel" (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      marker TEXT NOT NULL,
      database_name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const rows = await prisma.$queryRaw<
    Array<{ marker: string; database_name: string }>
  >`SELECT marker, database_name FROM "aulia_demo_seed_sentinel" WHERE id = 1`;

  if (rows.length === 0) {
    await prisma.$executeRaw`
      INSERT INTO "aulia_demo_seed_sentinel" (id, marker, database_name)
      VALUES (1, ${DEMO_DATABASE_MARKER}, ${databaseName})
    `;
  } else if (
    rows[0].marker !== DEMO_DATABASE_MARKER ||
    rows[0].database_name !== databaseName
  ) {
    throw new Error('Refus : une sentinelle différente existe déjà dans cette base.');
  }

  console.log(`Sentinelle DEMO provisionnée pour la base ${databaseName}.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : 'Échec du provisionnement DEMO.');
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
