import { Prisma, PrismaClient } from '@prisma/client';
import {
  assertDemoDatabaseIdentity,
  assertDemoSentinel,
  requireDemoConfirmation,
} from './demo-seed-safety';

const prisma = new PrismaClient();

type TableRow = { tablename: string };

function quoteIdentifier(identifier: string) {
  return `"${identifier.replace(/"/g, '""')}"`;
}

async function main() {
  // This is deliberately a separate confirmation from seeding.  It is only
  // valid after both the connected PostgreSQL identity and its DEMO sentinel
  // have been checked, so it cannot be pointed at an ordinary installation.
  requireDemoConfirmation('RESET_PUBLIC_CORE_DEMO');
  const databaseName = await assertDemoDatabaseIdentity(prisma);
  await assertDemoSentinel(prisma, databaseName);

  const tables = await prisma.$queryRaw<TableRow[]>(Prisma.sql`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT IN ('_prisma_migrations', 'aulia_demo_seed_sentinel')
    ORDER BY tablename
  `);

  if (!tables.length) {
    throw new Error('Aucune table applicative DEMO à réinitialiser.');
  }

  // Table names come from PostgreSQL's own system catalog and are still
  // quoted defensively.  Migration history and the database-bound sentinel
  // remain intact, so the following baseline seed has to pass its safeguards.
  const targets = tables
    .map(({ tablename }) => `"public".${quoteIdentifier(tablename)}`)
    .join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${targets} RESTART IDENTITY CASCADE`);

  await assertDemoSentinel(prisma, databaseName);
  console.log(`Contenu applicatif DEMO réinitialisé pour la base ${databaseName}.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : 'Échec de la réinitialisation DEMO.');
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
