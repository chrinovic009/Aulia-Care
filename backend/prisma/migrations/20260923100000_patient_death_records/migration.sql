-- Additive, auditable clinical death workflow. Existing patient rows remain
-- unchanged until a physician certifies an individual record.
CREATE TABLE "PatientDeathRecord" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "reportedById" TEXT,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reportNotes" TEXT,
    "certifiedById" TEXT,
    "certifiedAt" TIMESTAMP(3),
    "occurredAt" TIMESTAMP(3),
    "causeOfDeath" TEXT,
    "clinicalSummary" TEXT,
    "certificateNumber" TEXT,
    "status" TEXT NOT NULL DEFAULT 'REPORTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PatientDeathRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PatientDeathRecord_certificateNumber_key" ON "PatientDeathRecord"("certificateNumber");
CREATE INDEX "PatientDeathRecord_clinicId_patientId_idx" ON "PatientDeathRecord"("clinicId", "patientId");
CREATE INDEX "PatientDeathRecord_clinicId_status_idx" ON "PatientDeathRecord"("clinicId", "status");

ALTER TABLE "PatientDeathRecord" ADD CONSTRAINT "PatientDeathRecord_clinicId_fkey"
  FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PatientDeathRecord" ADD CONSTRAINT "PatientDeathRecord_patientId_fkey"
  FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PatientDeathRecord" ADD CONSTRAINT "PatientDeathRecord_reportedById_fkey"
  FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PatientDeathRecord" ADD CONSTRAINT "PatientDeathRecord_certifiedById_fkey"
  FOREIGN KEY ("certifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
