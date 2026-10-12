import assert from 'node:assert/strict';
import test from 'node:test';
import { PrismaClient } from '@prisma/client';
import {
  assertIsolatedE2eDatabaseConnection,
  resolveIsolatedE2eDatabaseTarget,
} from '../../src/core/e2e-database';

const databaseUrl = process.env.TEST_DATABASE_URL;

test('la base E2E est isolée, confirmée et accessible', async () => {
  const target = resolveIsolatedE2eDatabaseTarget(process.env);
  if (!databaseUrl) {
    throw new Error('TEST_DATABASE_URL is required for PostgreSQL E2E tests.');
  }
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    await assertIsolatedE2eDatabaseConnection(prisma, target);
    const result = await prisma.$queryRaw<Array<{ ok: number }>>`SELECT 1 AS ok`;
    assert.equal(Number(result[0]?.ok), 1);
  } finally {
    await prisma.$disconnect();
  }
});
