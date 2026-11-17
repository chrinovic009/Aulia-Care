import { randomInt } from 'crypto';

/**
 * Temporary code for a new account or a forgotten password: 6 random digits
 * from a cryptographic source, shown once to the administrator who hands it
 * over. It only opens the forced password-change screen, expires, and is
 * revoked after a few wrong attempts (see AuthService.validateUser).
 */
export function generateTemporaryPassword(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export const TEMPORARY_CODE_TTL_MS = {
  /** A new account may wait a few days before its holder first signs in. */
  NEW_ACCOUNT: 7 * 24 * 60 * 60 * 1000,
  /** A code issued for a forgotten password is used the same day. */
  RESET: 24 * 60 * 60 * 1000,
} as const;
export const TEMPORARY_CODE_MAX_ATTEMPTS = 5;

export const PASSWORD_MIN_LENGTH = 6;

/** The password a person chooses: at least 6 characters, with letters, digits and a symbol. */
export function passwordPolicyError(password: string): string | null {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) return `Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères.`;
  if (password.length > 128) return 'Le mot de passe ne peut pas dépasser 128 caractères.';
  if (!/\p{L}/u.test(password)) return 'Le mot de passe doit contenir au moins une lettre.';
  if (!/\d/.test(password)) return 'Le mot de passe doit contenir au moins un chiffre.';
  if (!/[^\p{L}\d\s]/u.test(password)) return 'Le mot de passe doit contenir au moins un symbole (par exemple ! @ # - _ .).';
  return null;
}
