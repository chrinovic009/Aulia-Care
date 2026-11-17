-- The Super Admin (created by the platform developer) and the administrators whose
-- password was chosen for them are not forced to change it at first sign-in:
-- the forced change applies to staff accounts opened or reset with a 6-digit code.
UPDATE "User"
SET "mustChangePassword" = false
WHERE "mustChangePassword" = true
  AND "temporaryPasswordExpiresAt" IS NULL
  AND "deletedAt" IS NULL
  AND "primaryRole" IN ('SUPER_ADMIN', 'ADMIN');
