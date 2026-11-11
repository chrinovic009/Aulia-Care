/**
 * Startup validation of the process environment.
 *
 * A misnamed or missing variable must stop the process at boot with an explicit
 * message, instead of silently degrading a clinical capability (for example the
 * Core falling back to its local engine because AULIA_DIAGNOSTIC_AGENT_URL was
 * written under a legacy name).
 */
export type AuliaProcessRole = 'core' | 'diagnostic-agent' | 'connected-care';

type Environment = Record<string, unknown>;

/** Names used before the Diagnostic Agent rename, mapped to their current name. */
export const LEGACY_ENVIRONMENT_NAMES: Readonly<Record<string, string>> = {
  AULIA_ENABLE_CLINICAL_AI: 'AULIA_ENABLE_DIAGNOSTIC_AGENT',
  CLINICAL_AI_PORT: 'DIAGNOSTIC_AGENT_PORT',
  AULIA_CLINICAL_AI_URL: 'AULIA_DIAGNOSTIC_AGENT_URL',
  CLINICAL_AI_SERVICE_SECRET: 'DIAGNOSTIC_AGENT_SERVICE_SECRET',
};

const MIN_PRODUCTION_SECRET_LENGTH = 32;

const text = (env: Environment, name: string) => {
  const value = env[name];
  return typeof value === 'string' ? value.trim() : value === undefined || value === null ? '' : String(value).trim();
};

const isEnabled = (env: Environment, name: string) => text(env, name).toLowerCase() === 'true';

export class EnvironmentValidationError extends Error {
  constructor(readonly problems: string[]) {
    super(`Configuration invalide (${problems.length} problème(s)) :\n- ${problems.join('\n- ')}`);
    this.name = 'EnvironmentValidationError';
  }
}

export function environmentProblems(env: Environment, role: AuliaProcessRole = 'core'): string[] {
  const problems: string[] = [];
  const production = text(env, 'NODE_ENV') === 'production';

  const required = (name: string, reason?: string) => {
    if (!text(env, name)) problems.push(`${name} est requis${reason ? ` (${reason})` : ''}.`);
  };
  const strongSecret = (name: string) => {
    const value = text(env, name);
    if (!value) {
      problems.push(`${name} est requis.`);
    } else if (production && value.length < MIN_PRODUCTION_SECRET_LENGTH) {
      problems.push(`${name} doit contenir au moins ${MIN_PRODUCTION_SECRET_LENGTH} caractères en production.`);
    }
  };

  for (const [legacy, current] of Object.entries(LEGACY_ENVIRONMENT_NAMES)) {
    if (text(env, legacy)) problems.push(`${legacy} est obsolète et ignoré : renommez-la ${current}.`);
  }

  if (role === 'core') {
    required('DATABASE_URL');
    required('CORS_ORIGIN');
    strongSecret('JWT_SECRET');
    strongSecret('JWT_REFRESH_SECRET');
    if (text(env, 'JWT_SECRET') && text(env, 'JWT_SECRET') === text(env, 'JWT_REFRESH_SECRET')) {
      problems.push('JWT_SECRET et JWT_REFRESH_SECRET doivent être différents.');
    }
    if (production && text(env, 'CORS_ORIGIN').split(',').some((origin) => origin.trim() === '*')) {
      problems.push('CORS_ORIGIN ne peut pas être « * » en production : les cookies de session sont envoyés.');
    }
    if (text(env, 'AULIA_DIAGNOSTIC_AGENT_URL')) {
      strongSecret('DIAGNOSTIC_AGENT_SERVICE_SECRET');
    } else if (production && isEnabled(env, 'AULIA_ENABLE_DIAGNOSTIC_AGENT')) {
      problems.push(
        'AULIA_ENABLE_DIAGNOSTIC_AGENT=true en production exige AULIA_DIAGNOSTIC_AGENT_URL ; sinon le Core utiliserait silencieusement le moteur local.',
      );
    }
    if (production && isEnabled(env, 'AULIA_ENABLE_CONNECTED_CARE')) {
      strongSecret('CONNECTED_CARE_INGESTION_SECRET');
    }
  }

  if (role === 'diagnostic-agent') {
    strongSecret('DIAGNOSTIC_AGENT_SERVICE_SECRET');
  }

  if (role === 'connected-care') {
    required('AULIA_CORE_CONNECTED_CARE_URL', 'adresse du Core');
    strongSecret('CONNECTED_CARE_INGESTION_SECRET');
    strongSecret('CONNECTED_CARE_GATEWAY_SECRET');
  }

  return problems;
}

/** `ConfigModule.forRoot({ validate })` adapter: returns the config untouched or throws. */
export function validateEnvironment(role: AuliaProcessRole = 'core') {
  return (env: Environment): Environment => {
    const problems = environmentProblems(env, role);
    if (problems.length) throw new EnvironmentValidationError(problems);
    return env;
  };
}
