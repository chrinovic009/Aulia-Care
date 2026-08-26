-- PINs are session re-authentication secrets, not account passwords.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "pinHash" TEXT,
  ADD COLUMN IF NOT EXISTS "pinUpdatedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "pinFailedAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "pinLockedUntil" TIMESTAMP(3);

-- A normal logout revokes only its identified session.  These columns retain
-- the reason and date without storing any raw refresh token.
ALTER TABLE "Session"
  ADD COLUMN IF NOT EXISTS "revokedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "revocationReason" TEXT;
