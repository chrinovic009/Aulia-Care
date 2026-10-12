import { Prisma, PrismaClient } from '@prisma/client';

/** Runtime mode is public configuration; it never grants extra access. */
export type AuliaAppMode = 'demo' | 'standard';

export type DemoDatabaseTarget = {
  databaseName: string;
  databaseUser: string;
  sentinel: string;
};

type DemoDatabaseEnvironment = Partial<Pick<
  NodeJS.ProcessEnv,
  | 'DATABASE_URL'
  | 'AULIA_DEMO_DATABASE_NAME'
  | 'AULIA_DEMO_DATABASE_USER'
  | 'AULIA_DEMO_DATABASE_SENTINEL'>>;

type ActualDemoDatabaseTarget = {
  databaseName: string;
  databaseUser: string;
  sentinel: string | null;
};

export const getAuliaAppMode = (
  environment: NodeJS.ProcessEnv = process.env,
): AuliaAppMode => environment.AULIA_APP_MODE === 'demo' ? 'demo' : 'standard';

export const isDemoMode = (
  environment: NodeJS.ProcessEnv = process.env,
): boolean => getAuliaAppMode(environment) === 'demo';

const requireSafeIdentifier = (value: string | undefined, variable: string): string => {
  const normalized = String(value || '').trim();
  if (!/^[a-z][a-z0-9_]{2,62}$/i.test(normalized)) {
    throw new Error(`Mode DEMO refuse : ${variable} doit etre un identifiant PostgreSQL explicite.`);
  }
  return normalized;
};

/**
 * Validates the declared deployment target before a connection is made. The
 * actual server-side identity is checked separately by assertDemoDatabaseConnection.
 */
export const resolveDemoDatabaseTarget = (
  environment: DemoDatabaseEnvironment = process.env,
): DemoDatabaseTarget => {
  const databaseName = requireSafeIdentifier(
    environment.AULIA_DEMO_DATABASE_NAME,
    'AULIA_DEMO_DATABASE_NAME',
  );
  const databaseUser = requireSafeIdentifier(
    environment.AULIA_DEMO_DATABASE_USER,
    'AULIA_DEMO_DATABASE_USER',
  );
  const sentinel = String(environment.AULIA_DEMO_DATABASE_SENTINEL || '');
  if (sentinel.length < 24) {
    throw new Error('Mode DEMO refuse : AULIA_DEMO_DATABASE_SENTINEL doit contenir au moins 24 caracteres.');
  }

  const databaseUrl = String(environment.DATABASE_URL || '');
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error('Mode DEMO refuse : DATABASE_URL est invalide.');
  }
  if (url.hostname !== '127.0.0.1' || url.port !== '55435') {
    throw new Error(
      'Mode DEMO refuse : PostgreSQL doit etre accessible uniquement sur 127.0.0.1:55435.',
    );
  }
  const declaredName = decodeURIComponent(url.pathname).replace(/^\/+/, '').split('/')[0];
  const declaredUser = decodeURIComponent(url.username);
  if (declaredName !== databaseName || declaredUser !== databaseUser) {
    throw new Error('Mode DEMO refuse : DATABASE_URL doit correspondre exactement a AULIA_DEMO_DATABASE_NAME et AULIA_DEMO_DATABASE_USER.');
  }

  return { databaseName, databaseUser, sentinel };
};

/**
 * Fails before any application listener is exposed. It binds declared runtime
 * configuration to the intended PostgreSQL database/user but does not connect.
 */
export const assertDemoDatabaseTarget = (
  environment: NodeJS.ProcessEnv = process.env,
): void => {
  if (!isDemoMode(environment)) return;
  resolveDemoDatabaseTarget(environment);
};

/**
 * Reads identity from the actual Prisma connection. The per-database sentinel
 * must be installed by a PostgreSQL administrator on the isolated DEMO DB.
 */
export const assertDemoDatabaseConnection = async (
  prisma: PrismaClient,
  target: DemoDatabaseTarget,
): Promise<void> => {
  const rows = await prisma.$queryRaw<ActualDemoDatabaseTarget[]>(Prisma.sql`
    SELECT
      current_database() AS "databaseName",
      current_user AS "databaseUser",
      current_setting('aulia.demo_seed_sentinel', true) AS "sentinel"
  `);
  const actual = rows[0];
  if (!actual
    || actual.databaseName !== target.databaseName
    || actual.databaseUser !== target.databaseUser
    || actual.sentinel !== target.sentinel) {
    throw new Error('Seed DEMO refuse : la connexion Prisma reelle ne correspond pas a la base PostgreSQL DEMO isolee confirmee.');
  }
};

/** Optional products must stay off in the public Core-only demonstration. */
export const isOptionalProductEnabled = (
  variable: 'AULIA_ENABLE_DIAGNOSTIC_AGENT' | 'AULIA_ENABLE_CONNECTED_CARE',
  environment: NodeJS.ProcessEnv = process.env,
): boolean => !isDemoMode(environment) && environment[variable] !== 'false';
