-- Temporary 6-digit codes expire and are revoked after repeated wrong attempts.
ALTER TABLE "User" ADD COLUMN "temporaryPasswordExpiresAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "temporaryPasswordAttempts" INTEGER NOT NULL DEFAULT 0;

-- Forgotten password: the holder asks, an administrator approves and hands over a new code.
CREATE TYPE "PasswordResetRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

CREATE TABLE "PasswordResetRequest" (
  "id" TEXT NOT NULL,
  "clinicId" TEXT,
  "userId" TEXT NOT NULL,
  "status" "PasswordResetRequestStatus" NOT NULL DEFAULT 'PENDING',
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedAt" TIMESTAMP(3),
  "decidedById" TEXT,
  "decisionNote" TEXT,
  CONSTRAINT "PasswordResetRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PasswordResetRequest_clinicId_status_idx" ON "PasswordResetRequest"("clinicId", "status");
CREATE INDEX "PasswordResetRequest_userId_status_idx" ON "PasswordResetRequest"("userId", "status");
-- One open request per account.
CREATE UNIQUE INDEX "PasswordResetRequest_one_pending_per_user" ON "PasswordResetRequest"("userId") WHERE "status" = 'PENDING';
ALTER TABLE "PasswordResetRequest" ADD CONSTRAINT "PasswordResetRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PasswordResetRequest" ADD CONSTRAINT "PasswordResetRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PasswordResetRequest" ADD CONSTRAINT "PasswordResetRequest_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE TRIGGER "PasswordResetRequest_audit_ledger" AFTER INSERT OR UPDATE OR DELETE ON "PasswordResetRequest"
  FOR EACH ROW EXECUTE FUNCTION "audit_capture"();
