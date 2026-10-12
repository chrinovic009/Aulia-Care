import { spawnSync } from 'child_process';
import { writeFileSync } from 'fs';
import { resolveIsolatedE2eDatabaseTarget } from '../core/e2e-database';

/*
 * Never derive E2E credentials from DATABASE_URL. A dedicated PostgreSQL
 * database, role and server-side sentinel must be provisioned separately.
 * The preflight verifies the identity observed by Prisma before migrations or
 * tests can write a single row.
 */
const target = resolveIsolatedE2eDatabaseTarget(process.env);
const testDatabaseUrl = String(process.env.TEST_DATABASE_URL || '').trim();
const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const environment = {
  ...process.env,
  DATABASE_URL: testDatabaseUrl,
  TEST_DATABASE_URL: testDatabaseUrl,
};

const run = (program: string, args: string[]) => spawnSync(program, args, {
  env: environment,
  stdio: 'inherit',
  // npm.cmd requires a shell on Windows, whereas process.execPath must run
  // directly because its path can contain spaces (for example C:\\Program Files).
  shell: process.platform === 'win32' && /\.cmd$/i.test(program),
});

const ensureSucceeded = (result: ReturnType<typeof spawnSync>, label: string) => {
  if (result.error) {
    throw new Error(`${label} could not start: ${result.error.message}`);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
};

const preflight = run(command, ['run', 'assert:isolated-e2e-db']);
ensureSucceeded(preflight, 'E2E database preflight');

const migration = run(
  npxCommand,
  ['prisma', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'],
);
ensureSucceeded(migration, 'Prisma migration');

const suite = String(process.env.AULIA_ISOLATED_TEST_SUITE || 'all').trim();
const reportPath = String(process.env.AULIA_ISOLATED_TEST_REPORT_PATH || '').trim();
type TestCommand = {
  label: string;
  program: string;
  args: string[];
};

const e2eFiles = [
  'test/e2e/bed-concurrency.postgres.e2e.test.ts',
  'test/e2e/clinical-flow.persistence.test.ts',
  'test/e2e/core-concurrency.postgres.e2e.test.ts',
  'test/e2e/core-patient-journey.http.e2e.test.ts',
  'test/e2e/core-resource-boundaries.http.e2e.test.ts',
  'test/e2e/database-readiness.test.ts',
  'test/e2e/http-clinic-isolation.e2e.test.ts',
  'test/e2e/patients-tenant-isolation.http.e2e.test.ts',
  'test/e2e/pharmacy-stock-concurrency.postgres.e2e.test.ts',
  'test/e2e/tenant-provisioning.http.e2e.test.ts',
];
const httpE2eFiles = e2eFiles.filter((file) => file.includes('.http.'));
const nodeTest = (file: string): TestCommand => ({
  label: file,
  program: process.execPath,
  args: ['--require', 'ts-node/register/transpile-only', '--test', '--test-concurrency=1', file],
});

const commandsBySuite: Record<string, TestCommand[]> = {
  all: [
    { label: 'test:integration', program: command, args: ['run', 'test:integration'] },
    ...e2eFiles.map(nodeTest),
  ],
  integration: [{ label: 'test:integration', program: command, args: ['run', 'test:integration'] }],
  e2e: e2eFiles.map(nodeTest),
  'e2e-http': httpE2eFiles.map(nodeTest),
};

const commands = commandsBySuite[suite];
if (!commands) {
  throw new Error('AULIA_ISOLATED_TEST_SUITE must be all, integration, e2e or e2e-http.');
}

const report: {
  suite: string;
  database: string;
  results: Array<{ script: string; status: number | null }>;
} = {
  suite,
  database: target.databaseName,
  results: [],
};

const persistReport = () => {
  if (reportPath) {
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }
};

for (const testCommand of commands) {
  const result = run(testCommand.program, testCommand.args);
  report.results.push({ script: testCommand.label, status: result.status });
  persistReport();
  console.info(`[isolated-postgres] ${testCommand.label} completed with status ${String(result.status)}`);
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
