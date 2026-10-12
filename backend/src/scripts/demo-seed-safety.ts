import { Prisma, PrismaClient } from '@prisma/client';

export const DEMO_DATABASE_MARKER = 'AULIA_PUBLIC_CORE_DEMO_V1';
export const DEMO_SOURCE_NODE = 'PUBLIC_CORE_DEMO';

type DatabaseIdentity = { database: string };
type Sentinel = { marker: string; database_name: string };

function requiredEnvironment(name: string) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} est obligatoire.`);
  return value;
}

export async function assertDemoDatabaseIdentity(prisma: PrismaClient) {
  if (process.env.AULIA_APP_MODE !== 'demo') {
    throw new Error('Le seed DEMO exige AULIA_APP_MODE=demo.');
  }

  const expectedDatabase = requiredEnvironment('AULIA_DEMO_DATABASE_NAME');
  const rows = await prisma.$queryRaw<DatabaseIdentity[]>(
    Prisma.sql`SELECT current_database() AS database`,
  );
  const actualDatabase = rows[0]?.database;

  if (!actualDatabase || actualDatabase !== expectedDatabase) {
    throw new Error(
      'La base PostgreSQL réellement connectée ne correspond pas à AULIA_DEMO_DATABASE_NAME.',
    );
  }

  return actualDatabase;
}

export async function assertDemoSentinel(
  prisma: PrismaClient,
  databaseName: string,
) {
  let sentinel: Sentinel[];
  try {
    sentinel = await prisma.$queryRaw<Sentinel[]>(
      Prisma.sql`SELECT marker, database_name FROM "aulia_demo_seed_sentinel" WHERE id = 1`,
    );
  } catch {
    throw new Error(
      'La sentinelle DEMO est absente. Exécutez demo:provision-sentinel sur une base DEMO vide avant le seed.',
    );
  }

  if (
    sentinel.length !== 1 ||
    sentinel[0].marker !== DEMO_DATABASE_MARKER ||
    sentinel[0].database_name !== databaseName
  ) {
    throw new Error('La sentinelle DEMO ne correspond pas à la base réellement connectée.');
  }
}

export function requireDemoConfirmation(expected: string) {
  if (process.env.AULIA_DEMO_SEED_CONFIRM !== expected) {
    throw new Error(`Confirmation explicite requise : AULIA_DEMO_SEED_CONFIRM=${expected}`);
  }
}
