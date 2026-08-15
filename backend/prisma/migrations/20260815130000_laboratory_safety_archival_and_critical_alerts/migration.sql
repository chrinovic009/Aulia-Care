-- Catalogue archival, parameter-level provenance and acknowledged critical laboratory alerts.
CREATE TYPE "LabCriticalAlertSeverity" AS ENUM ('HIGH', 'CRITICAL');
CREATE TYPE "LabCriticalAlertStatus" AS ENUM ('PENDING', 'ACKNOWLEDGED', 'RESOLVED');

ALTER TABLE "LabConsumableStock" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "LabTestConsumableRequirement" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "LabTestSampleRequirement" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "LabTestParameter"
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "criticalHigh" DECIMAL(12,4),
  ADD COLUMN "criticalLow" DECIMAL(12,4),
  ADD COLUMN "method" TEXT;
ALTER TABLE "LabResultParameter"
  ADD COLUMN "method" TEXT,
  ADD COLUMN "parameterCode" TEXT,
  ADD COLUMN "parameterName" TEXT,
  ADD COLUMN "referenceRange" TEXT,
  ADD COLUMN "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "reportedById" TEXT,
  ADD COLUMN "unit" TEXT,
  ADD COLUMN "validatedAt" TIMESTAMP(3),
  ADD COLUMN "validationNote" TEXT;

CREATE TABLE "LabCriticalAlert" (
  "id" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "labResultId" TEXT NOT NULL,
  "labResultParameterId" TEXT,
  "severity" "LabCriticalAlertSeverity" NOT NULL DEFAULT 'CRITICAL',
  "status" "LabCriticalAlertStatus" NOT NULL DEFAULT 'PENDING',
  "message" TEXT NOT NULL,
  "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acknowledgedAt" TIMESTAMP(3),
  "acknowledgedById" TEXT,
  "acknowledgementNote" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LabCriticalAlert_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LabCriticalAlert_patientId_status_detectedAt_idx" ON "LabCriticalAlert"("patientId", "status", "detectedAt");
CREATE INDEX "LabCriticalAlert_labResultId_idx" ON "LabCriticalAlert"("labResultId");

ALTER TABLE "LabResultParameter" ADD CONSTRAINT "LabResultParameter_reportedById_fkey"
  FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LabCriticalAlert" ADD CONSTRAINT "LabCriticalAlert_patientId_fkey"
  FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LabCriticalAlert" ADD CONSTRAINT "LabCriticalAlert_labResultId_fkey"
  FOREIGN KEY ("labResultId") REFERENCES "LabResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LabCriticalAlert" ADD CONSTRAINT "LabCriticalAlert_labResultParameterId_fkey"
  FOREIGN KEY ("labResultParameterId") REFERENCES "LabResultParameter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LabCriticalAlert" ADD CONSTRAINT "LabCriticalAlert_acknowledgedById_fkey"
  FOREIGN KEY ("acknowledgedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
