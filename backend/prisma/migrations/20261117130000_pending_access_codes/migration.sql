-- The 6-digit access code stays visible (encrypted at rest) to the
-- administrators who issued it until its holder has used it.
ALTER TABLE "User" ADD COLUMN "temporaryCodeCipher" TEXT;
ALTER TABLE "User" ADD COLUMN "temporaryCodeReason" TEXT;
ALTER TABLE "User" ADD COLUMN "temporaryCodeIssuedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "temporaryCodeIssuedById" TEXT;
-- Codes no longer expire with time: they remain valid until used (5 wrong attempts still revoke them).
UPDATE "User" SET "temporaryPasswordExpiresAt" = NULL WHERE "temporaryPasswordExpiresAt" > CURRENT_TIMESTAMP;
