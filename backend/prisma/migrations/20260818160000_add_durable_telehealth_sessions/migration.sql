-- Link a patient portal account explicitly. Email matching is only used once to
-- migrate pre-existing accounts; runtime code never uses email as identity.
ALTER TABLE "Patient" ADD COLUMN "portalUserId" TEXT;
CREATE UNIQUE INDEX "Patient_portalUserId_key" ON "Patient"("portalUserId");
ALTER TABLE "Patient"
  ADD CONSTRAINT "Patient_portalUserId_fkey"
  FOREIGN KEY ("portalUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "Patient" AS p
SET "portalUserId" = u."id"
FROM "User" AS u
WHERE p."portalUserId" IS NULL
  AND p."email" IS NOT NULL
  AND LOWER(p."email") = LOWER(u."email")
  AND u."primaryRole" = 'PATIENT';

CREATE TYPE "TelehealthSessionStatus" AS ENUM ('RINGING', 'ACTIVE', 'DECLINED', 'ENDED', 'EXPIRED', 'FAILED');

CREATE TABLE "TelehealthSession" (
  "id" TEXT NOT NULL,
  "consultationId" TEXT NOT NULL,
  "doctorId" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "patientUserId" TEXT NOT NULL,
  "status" "TelehealthSessionStatus" NOT NULL DEFAULT 'RINGING',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "initiatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acceptedAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "endedById" TEXT,
  "endReason" TEXT,
  "patientConsentAt" TIMESTAMP(3),
  "transcriptionConsentAt" TIMESTAMP(3),
  "incident" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TelehealthSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TelehealthSession_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TelehealthSession_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TelehealthSession_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TelehealthSession_patientUserId_fkey" FOREIGN KEY ("patientUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "TelehealthSession_consultationId_initiatedAt_idx" ON "TelehealthSession"("consultationId", "initiatedAt");
CREATE INDEX "TelehealthSession_patientUserId_status_expiresAt_idx" ON "TelehealthSession"("patientUserId", "status", "expiresAt");
CREATE INDEX "TelehealthSession_doctorId_status_expiresAt_idx" ON "TelehealthSession"("doctorId", "status", "expiresAt");
