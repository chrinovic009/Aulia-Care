CREATE TYPE "NursingCareTaskStatus" AS ENUM ('PENDING', 'COMPLETED', 'MISSED', 'ESCALATED', 'CANCELLED');
CREATE TYPE "MedicationAdministrationStatus" AS ENUM ('ADMINISTERED', 'REFUSED', 'HELD', 'MISSED');

CREATE TABLE "NursingCareTask" (
  "id" TEXT NOT NULL,
  "hospitalizationId" TEXT NOT NULL,
  "assignedNurseId" TEXT,
  "prescriptionLineId" TEXT,
  "title" TEXT NOT NULL,
  "instructions" TEXT,
  "dueAt" TIMESTAMP(3) NOT NULL,
  "status" "NursingCareTaskStatus" NOT NULL DEFAULT 'PENDING',
  "completedAt" TIMESTAMP(3),
  "completedById" TEXT,
  "escalationReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NursingCareTask_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "NursingCareTask_assignedNurseId_dueAt_status_idx" ON "NursingCareTask"("assignedNurseId", "dueAt", "status");
CREATE INDEX "NursingCareTask_hospitalizationId_dueAt_idx" ON "NursingCareTask"("hospitalizationId", "dueAt");
ALTER TABLE "NursingCareTask" ADD CONSTRAINT "NursingCareTask_hospitalizationId_fkey" FOREIGN KEY ("hospitalizationId") REFERENCES "Hospitalization"("id") ON DELETE CASCADE;
ALTER TABLE "NursingCareTask" ADD CONSTRAINT "NursingCareTask_assignedNurseId_fkey" FOREIGN KEY ("assignedNurseId") REFERENCES "User"("id") ON DELETE SET NULL;
ALTER TABLE "NursingCareTask" ADD CONSTRAINT "NursingCareTask_prescriptionLineId_fkey" FOREIGN KEY ("prescriptionLineId") REFERENCES "PrescriptionLine"("id") ON DELETE SET NULL;

CREATE TABLE "MedicationAdministration" (
  "id" TEXT NOT NULL,
  "hospitalizationId" TEXT NOT NULL,
  "prescriptionLineId" TEXT NOT NULL,
  "administeredById" TEXT NOT NULL,
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "administeredAt" TIMESTAMP(3),
  "status" "MedicationAdministrationStatus" NOT NULL,
  "doseGiven" TEXT,
  "reason" TEXT,
  "observation" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MedicationAdministration_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MedicationAdministration_hospitalizationId_scheduledAt_idx" ON "MedicationAdministration"("hospitalizationId", "scheduledAt");
CREATE INDEX "MedicationAdministration_prescriptionLineId_scheduledAt_idx" ON "MedicationAdministration"("prescriptionLineId", "scheduledAt");
ALTER TABLE "MedicationAdministration" ADD CONSTRAINT "MedicationAdministration_hospitalizationId_fkey" FOREIGN KEY ("hospitalizationId") REFERENCES "Hospitalization"("id") ON DELETE CASCADE;
ALTER TABLE "MedicationAdministration" ADD CONSTRAINT "MedicationAdministration_prescriptionLineId_fkey" FOREIGN KEY ("prescriptionLineId") REFERENCES "PrescriptionLine"("id") ON DELETE RESTRICT;
ALTER TABLE "MedicationAdministration" ADD CONSTRAINT "MedicationAdministration_administeredById_fkey" FOREIGN KEY ("administeredById") REFERENCES "User"("id") ON DELETE RESTRICT;

CREATE TABLE "SurgerySafetyChecklist" (
  "id" TEXT NOT NULL,
  "surgeryId" TEXT NOT NULL,
  "identityConfirmed" BOOLEAN NOT NULL DEFAULT false,
  "procedureSiteConfirmed" BOOLEAN NOT NULL DEFAULT false,
  "consentConfirmed" BOOLEAN NOT NULL DEFAULT false,
  "anesthesiaCheckDone" BOOLEAN NOT NULL DEFAULT false,
  "antibioticProphylaxis" BOOLEAN NOT NULL DEFAULT false,
  "imagingAvailable" BOOLEAN NOT NULL DEFAULT false,
  "instrumentCountCorrect" BOOLEAN NOT NULL DEFAULT false,
  "specimenLabelled" BOOLEAN NOT NULL DEFAULT false,
  "signInAt" TIMESTAMP(3),
  "timeOutAt" TIMESTAMP(3),
  "signOutAt" TIMESTAMP(3),
  "completedById" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SurgerySafetyChecklist_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SurgerySafetyChecklist_surgeryId_key" ON "SurgerySafetyChecklist"("surgeryId");
CREATE INDEX "SurgerySafetyChecklist_completedById_idx" ON "SurgerySafetyChecklist"("completedById");
ALTER TABLE "SurgerySafetyChecklist" ADD CONSTRAINT "SurgerySafetyChecklist_surgeryId_fkey" FOREIGN KEY ("surgeryId") REFERENCES "Surgery"("id") ON DELETE CASCADE;
