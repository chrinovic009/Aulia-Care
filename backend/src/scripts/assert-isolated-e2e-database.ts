import { PrismaClient } from '@prisma/client';
import {
  assertIsolatedE2eDatabaseConnection,
  resolveIsolatedE2eDatabaseTarget,
} from '../core/e2e-database';

async function main() {
  const target = resolveIsolatedE2eDatabaseTarget(process.env);
  const prisma = new PrismaClient({
    datasources: { db: { url: String(process.env.TEST_DATABASE_URL || '') } },
  });
  try {
    await assertIsolatedE2eDatabaseConnection(prisma, target);
    console.info(`[isolated-e2e] confirmed ${target.databaseName} as ${target.databaseUser}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'E2E PostgreSQL preflight failed.');
  process.exitCode = 1;
});
