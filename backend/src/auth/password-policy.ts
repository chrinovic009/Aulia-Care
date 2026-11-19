import { randomInt } from 'crypto';

/**
 * Temporary code for a new account or a forgotten password: 6 random digits
 * from a cryptographic source, shown once to the administrator who hands it
 * over. It only opens the forced password-change screen, stays valid until
 * used, and is revoked after a few wrong attempts (see AuthService.validateUser).
 */
export function generateTemporaryPassword(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

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
