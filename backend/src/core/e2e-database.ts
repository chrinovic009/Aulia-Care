import { Prisma, PrismaClient } from '@prisma/client';

/**
 * E2E writes are allowed only against a database explicitly provisioned for
 * this purpose. A database name alone is not evidence of isolation: the
 * server-side sentinel binds this configuration to the Prisma connection.
 */
export type IsolatedE2eDatabaseTarget = {
  databaseName: string;
  databaseUser: string;
  sentinel: string;
};

type E2eDatabaseEnvironment = Partial<Pick<NodeJS.ProcessEnv,
  | 'TEST_DATABASE_URL'
  | 'AULIA_E2E_DATABASE_NAME'
  | 'AULIA_E2E_DATABASE_USER'
  | 'AULIA_E2E_DATABASE_SENTINEL'
  | 'AULIA_E2E_TEST_CONFIRM'>>;

type ActualE2eDatabaseTarget = {
  databaseName: string;
  databaseUser: string;
  sentinel: string | null;
};

const requireIdentifier = (value: string | undefined, variable: string): string => {
  const normalized = String(value || '').trim();
  if (!/^[a-z][a-z0-9_]{2,62}$/i.test(normalized)) {
    throw new Error(`Tests E2E refused: ${variable} must be an explicit PostgreSQL identifier.`);
  }
  return normalized;
};

/** Validates the declared E2E target before any connection or migration. */
export const resolveIsolatedE2eDatabaseTarget = (
  environment: E2eDatabaseEnvironment = process.env,
): IsolatedE2eDatabaseTarget => {
  if (environment.AULIA_E2E_TEST_CONFIRM !== 'ISOLATED_POSTGRES_ONLY') {
    throw new Error('Tests E2E refused: AULIA_E2E_TEST_CONFIRM=ISOLATED_POSTGRES_ONLY is required.');
  }

  const databaseName = requireIdentifier(environment.AULIA_E2E_DATABASE_NAME, 'AULIA_E2E_DATABASE_NAME');
  const databaseUser = requireIdentifier(environment.AULIA_E2E_DATABASE_USER, 'AULIA_E2E_DATABASE_USER');
  if (!databaseName.startsWith('aulia_e2e_')) {
    throw new Error('Tests E2E refused: AULIA_E2E_DATABASE_NAME must use the reserved aulia_e2e_ prefix.');
  }

  const sentinel = String(environment.AULIA_E2E_DATABASE_SENTINEL || '');
  if (sentinel.length < 24) {
    throw new Error('Tests E2E refused: AULIA_E2E_DATABASE_SENTINEL must contain at least 24 characters.');
  }

  let url: URL;
  try {
    url = new URL(String(environment.TEST_DATABASE_URL || ''));
  } catch {
    throw new Error('Tests E2E refused: TEST_DATABASE_URL is invalid.');
  }
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw new Error('Tests E2E refused: TEST_DATABASE_URL must target PostgreSQL.');
  }
  const urlDatabaseName = decodeURIComponent(url.pathname).replace(/^\/+/, '').split('/')[0];
  const urlDatabaseUser = decodeURIComponent(url.username);
  if (urlDatabaseName !== databaseName || urlDatabaseUser !== databaseUser) {
    throw new Error('Tests E2E refused: TEST_DATABASE_URL must exactly match the declared database and user.');
  }

  return { databaseName, databaseUser, sentinel };
};

/** The sentinel is provisioned outside the test suite and is never changed by it. */
export const assertIsolatedE2eDatabaseConnection = async (
  prisma: PrismaClient,
  target: IsolatedE2eDatabaseTarget,
): Promise<void> => {
  const rows = await prisma.$queryRaw<ActualE2eDatabaseTarget[]>(Prisma.sql`
    SELECT
      current_database() AS "databaseName",
      current_user AS "databaseUser",
      current_setting('aulia.e2e_test_sentinel', true) AS "sentinel"
  `);
  const actual = rows[0];
  if (!actual
    || actual.databaseName !== target.databaseName
    || actual.databaseUser !== target.databaseUser
    || actual.sentinel !== target.sentinel) {
    throw new Error('Tests E2E refused: the real Prisma connection is not the confirmed isolated PostgreSQL database.');
  }
};
