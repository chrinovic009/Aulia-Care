import { randomInt } from 'crypto';

/** No look-alike characters (0/O, 1/l/I) so a temporary password can be read out or copied by hand. */
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const DIGITS = '23456789';
const ALL = UPPER + LOWER + DIGITS;

/**
 * Temporary password for a new or reset account: 12 random characters from a
 * cryptographic source (about 70 bits), shown once to the administrator. It
 * only opens the forced password-change screen.
 */
export function generateTemporaryPassword(): string {
  const chars = [UPPER, LOWER, DIGITS].map((set) => set[randomInt(set.length)]);
  while (chars.length < 12) chars.push(ALL[randomInt(ALL.length)]);
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  const raw = chars.join('');
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

export const PASSWORD_MIN_LENGTH = 10;

/** Returns the reason a chosen password is refused, or null when it is acceptable. */
export function passwordPolicyError(password: string, context: { username?: string; firstName?: string; lastName?: string } = {}): string | null {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) return `Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères.`;
  if (password.length > 128) return 'Le mot de passe ne peut pas dépasser 128 caractères.';
  if (!/[A-Za-zÀ-ÿ]/.test(password) || !/\d/.test(password)) return 'Le mot de passe doit contenir au moins une lettre et un chiffre.';
  if (/^(.)\1+$/.test(password)) return 'Le mot de passe ne peut pas répéter un seul caractère.';
  const lowered = password.toLowerCase();
  for (const word of [context.username, context.firstName, context.lastName]) {
    if (word && word.trim().length >= 3 && lowered.includes(word.trim().toLowerCase())) return 'Le mot de passe ne doit pas contenir votre nom ou votre identifiant.';
  }
  if (['aulia', 'password', 'motdepasse', 'azerty', 'qwerty', '123456'].some((weak) => lowered.includes(weak))) return 'Le mot de passe est trop facile à deviner.';
  return null;
}
