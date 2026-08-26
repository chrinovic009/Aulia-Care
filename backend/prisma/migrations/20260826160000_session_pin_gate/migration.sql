ALTER TABLE "Session"
  ADD COLUMN IF NOT EXISTS "pinLockedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "pinVerifiedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Session_userId_pinLockedAt_idx" ON "Session"("userId", "pinLockedAt");
