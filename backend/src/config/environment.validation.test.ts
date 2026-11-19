import assert from 'node:assert/strict';
import test from 'node:test';
import { EnvironmentValidationError, environmentProblems, validateEnvironment } from './environment.validation';

const secret = (seed: string) => seed.repeat(40).slice(0, 40);
const validCore = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://aulia@postgres:5432/aulia_care',
  CORS_ORIGIN: 'https://care.example.cd',
  JWT_SECRET: secret('a'),
  JWT_REFRESH_SECRET: secret('b'),
  AULIA_ENABLE_DIAGNOSTIC_AGENT: 'true',
  AULIA_DIAGNOSTIC_AGENT_URL: 'http://diagnostic-agent:3100',
  DIAGNOSTIC_AGENT_SERVICE_SECRET: secret('c'),
  AULIA_ENABLE_CONNECTED_CARE: 'true',
  CONNECTED_CARE_INGESTION_SECRET: secret('d'),
};

test('a complete production Core configuration is accepted unchanged', () => {
  assert.deepEqual(environmentProblems(validCore), []);
  assert.equal(validateEnvironment('core')(validCore), validCore);
});

test('legacy CLINICAL_AI names are reported with their replacement', () => {
  const problems = environmentProblems({ ...validCore, CLINICAL_AI_SERVICE_SECRET: secret('x'), AULIA_CLINICAL_AI_URL: 'http://clinical-ai:3100' });
  assert.ok(problems.some((p) => p.includes('CLINICAL_AI_SERVICE_SECRET') && p.includes('DIAGNOSTIC_AGENT_SERVICE_SECRET')));
  assert.ok(problems.some((p) => p.includes('AULIA_CLINICAL_AI_URL') && p.includes('AULIA_DIAGNOSTIC_AGENT_URL')));
});

test('production refuses an enabled Diagnostic Agent without its URL instead of falling back silently', () => {
  const { AULIA_DIAGNOSTIC_AGENT_URL: _url, ...withoutUrl } = validCore;
  const problems = environmentProblems(withoutUrl);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /AULIA_DIAGNOSTIC_AGENT_URL/);
});

test('a remote Diagnostic Agent URL requires its service secret', () => {
  const { DIAGNOSTIC_AGENT_SERVICE_SECRET: _secret, ...withoutSecret } = validCore;
  assert.ok(environmentProblems(withoutSecret).some((p) => p.startsWith('DIAGNOSTIC_AGENT_SERVICE_SECRET')));
});

test('production rejects short or identical JWT secrets and a wildcard CORS origin', () => {
  const problems = environmentProblems({ ...validCore, JWT_SECRET: 'short', JWT_REFRESH_SECRET: 'short', CORS_ORIGIN: '*' });
  assert.ok(problems.some((p) => p.startsWith('JWT_SECRET doit contenir')));
  assert.ok(problems.some((p) => p.includes('doivent être différents')));
  assert.ok(problems.some((p) => p.startsWith('CORS_ORIGIN ne peut pas')));
});

test('development keeps short secrets usable but still requires the essentials', () => {
  assert.deepEqual(
    environmentProblems({ NODE_ENV: 'development', DATABASE_URL: 'postgresql://x', CORS_ORIGIN: 'http://localhost:5173', JWT_SECRET: 'dev-a', JWT_REFRESH_SECRET: 'dev-b' }),
    [],
  );
  const missing = environmentProblems({ NODE_ENV: 'development' });
  for (const name of ['DATABASE_URL', 'CORS_ORIGIN', 'JWT_SECRET', 'JWT_REFRESH_SECRET']) {
    assert.ok(missing.some((p) => p.startsWith(name)), name);
  }
});

test('each standalone process validates only its own secrets', () => {
  assert.deepEqual(environmentProblems({ NODE_ENV: 'production', DIAGNOSTIC_AGENT_SERVICE_SECRET: secret('c') }, 'diagnostic-agent'), []);
  assert.equal(environmentProblems({ NODE_ENV: 'production' }, 'connected-care').length, 3);
});

test('the ConfigModule adapter throws a single error listing every problem', () => {
  assert.throws(() => validateEnvironment('core')({}), (error: unknown) => {
    assert.ok(error instanceof EnvironmentValidationError);
    assert.equal(error.problems.length, 4);
    return true;
  });
});
