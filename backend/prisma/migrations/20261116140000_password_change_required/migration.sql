-- Accounts opened or reset by an administrator must choose their own password
-- at first sign-in. The temporary password only opens the change screen.
ALTER TABLE "User" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "passwordChangedAt" TIMESTAMP(3);

-- Staff accounts that never signed in still hold the old, predictable initial
-- password: they are required to change it at their first sign-in.
UPDATE "User"
SET "mustChangePassword" = true
WHERE "lastLoginAt" IS NULL
  AND "deletedAt" IS NULL
  AND "primaryRole" IS NOT NULL
  AND "primaryRole" NOT IN ('PATIENT', 'SUPER_ADMIN', 'DEV');
