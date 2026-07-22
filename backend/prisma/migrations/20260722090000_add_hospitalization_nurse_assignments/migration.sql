-- Day/night nursing coverage for a hospitalization.
-- The application verifies the live Shift records before granting write access.
CREATE TYPE "NursingCoverage" AS ENUM ('DAY', 'NIGHT');

CREATE TABLE "HospitalizationNurseAssignment" (
  "id" TEXT NOT NULL,
  "hospitalizationId" TEXT NOT NULL,
  "nurseId" TEXT NOT NULL,
  "coverage" "NursingCoverage" NOT NULL,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "releasedAt" TIMESTAMP(3),
  "assignedById" TEXT,

  CONSTRAINT "HospitalizationNurseAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HospitalizationNurseAssignment_hospitalizationId_coverage_key"
  ON "HospitalizationNurseAssignment"("hospitalizationId", "coverage");
CREATE INDEX "HospitalizationNurseAssignment_nurseId_releasedAt_idx"
  ON "HospitalizationNurseAssignment"("nurseId", "releasedAt");

ALTER TABLE "HospitalizationNurseAssignment"
  ADD CONSTRAINT "HospitalizationNurseAssignment_hospitalizationId_fkey"
  FOREIGN KEY ("hospitalizationId") REFERENCES "Hospitalization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HospitalizationNurseAssignment"
  ADD CONSTRAINT "HospitalizationNurseAssignment_nurseId_fkey"
  FOREIGN KEY ("nurseId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
