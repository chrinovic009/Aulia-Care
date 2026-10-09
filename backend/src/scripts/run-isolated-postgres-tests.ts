import { spawnSync } from 'child_process';
import { writeFileSync } from 'fs';

const sourceUrl = String(process.env.DATABASE_URL || '').trim();
if (!sourceUrl) {
  throw new Error('DATABASE_URL est requis pour dériver la base de test isolée.');
}

const source = new URL(sourceUrl);
if (source.protocol !== 'postgresql:' && source.protocol !== 'postgres:') {
  throw new Error('DATABASE_URL doit désigner PostgreSQL.');
}
if (source.pathname !== '/aulia_care') {
  throw new Error('Refus de test : la source doit être exactement la base de développement aulia_care.');
}

/*
 * Docker Desktop on some Windows installations publishes PostgreSQL only on
 * the IPv4 loopback interface.  Node resolves `localhost` to ::1 first on
 * those machines, which makes an otherwise healthy isolated test database
 * look unavailable.  This applies only to the local test runner; production
 * connection settings are deliberately left untouched.
 */
const testHostOverride = String(process.env.AULIA_E2E_DATABASE_HOST || '').trim();
if (testHostOverride) {
  source.hostname = testHostOverride;
} else if (source.hostname === 'localhost') {
  source.hostname = '127.0.0.1';
}

const testDatabaseName = String(process.env.AULIA_E2E_DATABASE_NAME || 'aulia_care_e2e').trim();
if (!/^[a-z][a-z0-9_]{2,62}$/.test(testDatabaseName) || testDatabaseName === 'aulia_care') {
  throw new Error('Nom de base E2E invalide ou non isolé.');
}

source.pathname = `/${testDatabaseName}`;
const testDatabaseUrl = source.toString();
if (testDatabaseUrl === sourceUrl) {
  throw new Error('Refus de test : la base E2E ne peut pas être la base source.');
}

const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const environment = {
  ...process.env,
  // Migrations and tests run against the same isolated database.  The source
  // development database is never used for either operation.
  DATABASE_URL: testDatabaseUrl,
  TEST_DATABASE_URL: testDatabaseUrl,
};

const migration = spawnSync(
  npxCommand,
  ['prisma', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'],
  { env: environment, stdio: 'inherit' },
);
if (migration.status !== 0) {
  process.exit(migration.status ?? 1);
}

const generated = spawnSync(
  npxCommand,
  ['prisma', 'generate', '--schema', 'prisma/schema.prisma'],
  { env: environment, stdio: 'inherit' },
);
if (generated.status !== 0) {
  process.exit(generated.status ?? 1);
}

const suite = String(process.env.AULIA_ISOLATED_TEST_SUITE || 'all').trim();
const reportPath = String(process.env.AULIA_ISOLATED_TEST_REPORT_PATH || '').trim();
const scriptsBySuite: Record<string, string[]> = {
  all: ['test:integration', 'test:e2e'],
  integration: ['test:integration'],
  e2e: ['test:e2e'],
  'e2e-http': ['test:e2e:http'],
};

const scripts = scriptsBySuite[suite];
if (!scripts) {
  throw new Error('AULIA_ISOLATED_TEST_SUITE doit être all, integration, e2e ou e2e-http.');
}

const report: {
  suite: string;
  database: string;
  results: Array<{ script: string; status: number | null }>;
} = {
  suite,
  database: testDatabaseName,
  results: [],
};

const persistReport = () => {
  if (reportPath) {
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }
};

for (const script of scripts) {
  const result = spawnSync(command, ['run', script], {
    env: environment,
    stdio: 'inherit',
  });
  report.results.push({ script, status: result.status });
  persistReport();
  console.info(`[isolated-postgres] ${script} completed with status ${String(result.status)}`);
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
