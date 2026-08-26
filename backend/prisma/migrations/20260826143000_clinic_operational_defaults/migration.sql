-- Configurable operational defaults. Existing installations preserve their
-- historical 3×8 behaviour until an administrator changes the settings.
ALTER TABLE "Clinic"
  ADD COLUMN IF NOT EXISTS "timezone" TEXT NOT NULL DEFAULT 'Africa/Lubumbashi',
  ADD COLUMN IF NOT EXISTS "defaultNursePatientCapacity" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS "dayShiftStart" TEXT NOT NULL DEFAULT '07:30',
  ADD COLUMN IF NOT EXISTS "dayShiftEnd" TEXT NOT NULL DEFAULT '17:30',
  ADD COLUMN IF NOT EXISTS "nightShiftStart" TEXT NOT NULL DEFAULT '17:30',
  ADD COLUMN IF NOT EXISTS "nightShiftEnd" TEXT NOT NULL DEFAULT '07:30';

ALTER TABLE "ServiceUnit"
  ADD COLUMN IF NOT EXISTS "nursePatientCapacity" INTEGER;

ALTER TABLE "LoginAttempt"
  ADD COLUMN IF NOT EXISTS "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "LoginAttempt_occurredAt_idx" ON "LoginAttempt"("occurredAt");
CREATE INDEX IF NOT EXISTS "LoginAttempt_username_occurredAt_idx" ON "LoginAttempt"("username", "occurredAt");
