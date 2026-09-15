import assert from 'node:assert/strict';
import test from 'node:test';
import { readInitialPlatformDevBootstrapConfig } from './bootstrap-initial-platform-dev';

const bootstrapKeys = [
  'NODE_ENV',
  'AULIA_INITIAL_DEV_BOOTSTRAP_ENABLED',
  'AULIA_INITIAL_DEV_BOOTSTRAP_CONFIRM',
  'AULIA_INITIAL_DEV_BOOTSTRAP_EMAIL',
  'AULIA_INITIAL_DEV_BOOTSTRAP_USERNAME',
  'AULIA_INITIAL_DEV_BOOTSTRAP_PASSWORD',
  'AULIA_INITIAL_DEV_BOOTSTRAP_TOKEN',
  'AULIA_INITIAL_DEV_BOOTSTRAP_TOKEN_HASH',
] as const;

function withBootstrapEnvironment(
  values: Record<(typeof bootstrapKeys)[number], string | undefined>,
  callback: () => void,
) {
  const previous = Object.fromEntries(
    bootstrapKeys.map((key) => [key, process.env[key]]),
  );

  try {
    for (const key of bootstrapKeys) {
      const value = values[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    callback();
  } finally {
    for (const key of bootstrapKeys) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const validProductionEnvironment = {
  NODE_ENV: 'production',
  AULIA_INITIAL_DEV_BOOTSTRAP_ENABLED: 'true',
  AULIA_INITIAL_DEV_BOOTSTRAP_CONFIRM: 'CREATE_INITIAL_PLATFORM_DEV',
  AULIA_INITIAL_DEV_BOOTSTRAP_EMAIL: 'platform@example.test',
  AULIA_INITIAL_DEV_BOOTSTRAP_USERNAME: 'platform-dev',
  AULIA_INITIAL_DEV_BOOTSTRAP_PASSWORD: 'a-strong-initial-password',
  AULIA_INITIAL_DEV_BOOTSTRAP_TOKEN: 'a'.repeat(32),
  AULIA_INITIAL_DEV_BOOTSTRAP_TOKEN_HASH: '$2b$12$placeholder',
} as const;

test('initial production DEV bootstrap fails closed outside production', () => {
  withBootstrapEnvironment(
    { ...validProductionEnvironment, NODE_ENV: 'development' },
    () => {
      assert.throws(
        () => readInitialPlatformDevBootstrapConfig(),
        /NODE_ENV=production/,
      );
    },
  );
});

test('initial production DEV bootstrap requires every explicit approval control', () => {
  withBootstrapEnvironment(
    { ...validProductionEnvironment, AULIA_INITIAL_DEV_BOOTSTRAP_ENABLED: undefined },
    () => {
      assert.throws(
        () => readInitialPlatformDevBootstrapConfig(),
        /AULIA_INITIAL_DEV_BOOTSTRAP_ENABLED=true/,
      );
    },
  );
});

test('initial production DEV bootstrap accepts only a valid explicit configuration', () => {
  withBootstrapEnvironment(validProductionEnvironment, () => {
    const config = readInitialPlatformDevBootstrapConfig();
    assert.equal(config.username, 'platform-dev');
    assert.equal(config.email, 'platform@example.test');
    assert.equal(config.approvalToken.length, 32);
  });
});
