-- CreateEnum
CREATE TYPE "CareUnitKind" AS ENUM ('EMERGENCY', 'AMBULANCE', 'SURGERY', 'MATERNITY', 'NEONATAL', 'DIALYSIS', 'HOSPITALIZATION', 'CONSULTATION', 'LABORATORY', 'IMAGING', 'PHARMACY', 'OTHER');

-- CreateEnum
CREATE TYPE "CareUnitRole" AS ENUM ('MEMBER', 'LEAD', 'READ_ONLY');

-- CreateEnum
CREATE TYPE "CarePriority" AS ENUM ('ROUTINE', 'URGENT', 'ASAP', 'STAT');

-- CreateEnum
CREATE TYPE "CareEpisodeStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED', 'ENTERED_IN_ERROR');

-- CreateEnum
CREATE TYPE "ServiceRequestStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ON_HOLD', 'REVOKED', 'COMPLETED', 'ENTERED_IN_ERROR');

-- CreateEnum
CREATE TYPE "ServiceRequestIntent" AS ENUM ('PROPOSAL', 'PLAN', 'ORDER');

-- CreateEnum
CREATE TYPE "CareTaskStatus" AS ENUM ('REQUESTED', 'RECEIVED', 'ACCEPTED', 'REJECTED', 'READY', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "CareTransferStatus" AS ENUM ('SENT', 'RECEIVED', 'ACCEPTED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PatientIdentityStatus" AS ENUM ('CONFIRMED', 'PROVISIONAL', 'MERGED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "RoleSlug" ADD VALUE 'PARAMEDIC';
ALTER TYPE "RoleSlug" ADD VALUE 'DISPATCHER';
ALTER TYPE "RoleSlug" ADD VALUE 'MIDWIFE';

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "dateOfBirthEstimated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "identityStatus" "PatientIdentityStatus" NOT NULL DEFAULT 'CONFIRMED',
ADD COLUMN     "mergedIntoPatientId" TEXT;

-- CreateTable
CREATE TABLE "CareUnit" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "kind" "CareUnitKind" NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "settings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CareUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareUnitAssignment" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "careUnitId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "unitRole" "CareUnitRole" NOT NULL DEFAULT 'MEMBER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CareUnitAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareEpisode" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "careUnitId" TEXT NOT NULL,
    "status" "CareEpisodeStatus" NOT NULL DEFAULT 'PLANNED',
    "stage" TEXT,
    "priority" "CarePriority" NOT NULL DEFAULT 'ROUTINE',
    "reason" TEXT,
    "locationLabel" TEXT,
    "plannedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "outcome" TEXT,
    "outcomeDetail" JSONB,
    "responsibleUserId" TEXT,
    "sourceRequestId" TEXT,
    "parentEpisodeId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CareEpisode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceRequest" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "episodeId" TEXT,
    "requesterId" TEXT NOT NULL,
    "requesterUnitId" TEXT,
    "performerUnitId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "reason" TEXT,
    "priority" "CarePriority" NOT NULL DEFAULT 'ROUTINE',
    "intent" "ServiceRequestIntent" NOT NULL DEFAULT 'ORDER',
    "status" "ServiceRequestStatus" NOT NULL DEFAULT 'ACTIVE',
    "statusReason" TEXT,
    "desiredAt" TIMESTAMP(3),
    "details" JSONB,
    "authoredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareTask" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT,
    "careUnitId" TEXT NOT NULL,
    "requestId" TEXT,
    "episodeId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "CareTaskStatus" NOT NULL DEFAULT 'REQUESTED',
    "statusReason" TEXT,
    "priority" "CarePriority" NOT NULL DEFAULT 'ROUTINE',
    "ownerUserId" TEXT,
    "dueAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CareTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareEvent" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT,
    "careUnitId" TEXT,
    "episodeId" TEXT,
    "requestId" TEXT,
    "taskId" TEXT,
    "transferId" TEXT,
    "type" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "payload" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "authorId" TEXT NOT NULL,
    "authorRole" TEXT NOT NULL,
    "requiresValidation" BOOLEAN NOT NULL DEFAULT false,
    "validatesEventId" TEXT,
    "correctsEventId" TEXT,
    "correctionReason" TEXT,

    CONSTRAINT "CareEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareTransfer" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "fromUnitId" TEXT,
    "toUnitId" TEXT NOT NULL,
    "fromEpisodeId" TEXT,
    "toEpisodeId" TEXT,
    "requestId" TEXT,
    "senderId" TEXT NOT NULL,
    "receiverId" TEXT,
    "status" "CareTransferStatus" NOT NULL DEFAULT 'SENT',
    "reason" TEXT NOT NULL,
    "summary" JSONB NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "decisionReason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CareTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CareUnit_clinicId_kind_idx" ON "CareUnit"("clinicId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "CareUnit_clinicId_code_key" ON "CareUnit"("clinicId", "code");

-- CreateIndex
CREATE INDEX "CareUnitAssignment_userId_active_idx" ON "CareUnitAssignment"("userId", "active");

-- CreateIndex
CREATE INDEX "CareUnitAssignment_clinicId_idx" ON "CareUnitAssignment"("clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "CareUnitAssignment_careUnitId_userId_key" ON "CareUnitAssignment"("careUnitId", "userId");

-- CreateIndex
CREATE INDEX "CareEpisode_clinicId_careUnitId_status_idx" ON "CareEpisode"("clinicId", "careUnitId", "status");

-- CreateIndex
CREATE INDEX "CareEpisode_patientId_createdAt_idx" ON "CareEpisode"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "CareEpisode_sourceRequestId_idx" ON "CareEpisode"("sourceRequestId");

-- CreateIndex
CREATE INDEX "ServiceRequest_clinicId_performerUnitId_status_idx" ON "ServiceRequest"("clinicId", "performerUnitId", "status");

-- CreateIndex
CREATE INDEX "ServiceRequest_patientId_authoredAt_idx" ON "ServiceRequest"("patientId", "authoredAt");

-- CreateIndex
CREATE INDEX "ServiceRequest_episodeId_idx" ON "ServiceRequest"("episodeId");

-- CreateIndex
CREATE INDEX "CareTask_clinicId_careUnitId_status_idx" ON "CareTask"("clinicId", "careUnitId", "status");

-- CreateIndex
CREATE INDEX "CareTask_ownerUserId_status_idx" ON "CareTask"("ownerUserId", "status");

-- CreateIndex
CREATE INDEX "CareTask_requestId_idx" ON "CareTask"("requestId");

-- CreateIndex
CREATE INDEX "CareTask_episodeId_idx" ON "CareTask"("episodeId");

-- CreateIndex
CREATE INDEX "CareEvent_clinicId_occurredAt_idx" ON "CareEvent"("clinicId", "occurredAt");

-- CreateIndex
CREATE INDEX "CareEvent_patientId_occurredAt_idx" ON "CareEvent"("patientId", "occurredAt");

-- CreateIndex
CREATE INDEX "CareEvent_episodeId_occurredAt_idx" ON "CareEvent"("episodeId", "occurredAt");

-- CreateIndex
CREATE INDEX "CareEvent_requestId_idx" ON "CareEvent"("requestId");

-- CreateIndex
CREATE INDEX "CareEvent_taskId_idx" ON "CareEvent"("taskId");

-- CreateIndex
CREATE INDEX "CareEvent_transferId_idx" ON "CareEvent"("transferId");

-- CreateIndex
CREATE INDEX "CareTransfer_clinicId_toUnitId_status_idx" ON "CareTransfer"("clinicId", "toUnitId", "status");

-- CreateIndex
CREATE INDEX "CareTransfer_patientId_sentAt_idx" ON "CareTransfer"("patientId", "sentAt");

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_mergedIntoPatientId_fkey" FOREIGN KEY ("mergedIntoPatientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareUnit" ADD CONSTRAINT "CareUnit_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareUnitAssignment" ADD CONSTRAINT "CareUnitAssignment_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareUnitAssignment" ADD CONSTRAINT "CareUnitAssignment_careUnitId_fkey" FOREIGN KEY ("careUnitId") REFERENCES "CareUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareUnitAssignment" ADD CONSTRAINT "CareUnitAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareUnitAssignment" ADD CONSTRAINT "CareUnitAssignment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareEpisode" ADD CONSTRAINT "CareEpisode_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareEpisode" ADD CONSTRAINT "CareEpisode_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareEpisode" ADD CONSTRAINT "CareEpisode_careUnitId_fkey" FOREIGN KEY ("careUnitId") REFERENCES "CareUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareEpisode" ADD CONSTRAINT "CareEpisode_responsibleUserId_fkey" FOREIGN KEY ("responsibleUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareEpisode" ADD CONSTRAINT "CareEpisode_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareEpisode" ADD CONSTRAINT "CareEpisode_sourceRequestId_fkey" FOREIGN KEY ("sourceRequestId") REFERENCES "ServiceRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareEpisode" ADD CONSTRAINT "CareEpisode_parentEpisodeId_fkey" FOREIGN KEY ("parentEpisodeId") REFERENCES "CareEpisode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "CareEpisode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_requesterUnitId_fkey" FOREIGN KEY ("requesterUnitId") REFERENCES "CareUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_performerUnitId_fkey" FOREIGN KEY ("performerUnitId") REFERENCES "CareUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareTask" ADD CONSTRAINT "CareTask_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareTask" ADD CONSTRAINT "CareTask_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareTask" ADD CONSTRAINT "CareTask_careUnitId_fkey" FOREIGN KEY ("careUnitId") REFERENCES "CareUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareTask" ADD CONSTRAINT "CareTask_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareTask" ADD CONSTRAINT "CareTask_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "CareEpisode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareTask" ADD CONSTRAINT "CareTask_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareTask" ADD CONSTRAINT "CareTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareEvent" ADD CONSTRAINT "CareEvent_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareEvent" ADD CONSTRAINT "CareEvent_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareEvent" ADD CONSTRAINT "CareEvent_careUnitId_fkey" FOREIGN KEY ("careUnitId") REFERENCES "CareUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareEvent" ADD CONSTRAINT "CareEvent_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "CareEpisode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareEvent" ADD CONSTRAINT "CareEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareEvent" ADD CONSTRAINT "CareEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "CareTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareEvent" ADD CONSTRAINT "CareEvent_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "CareTransfer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareEvent" ADD CONSTRAINT "CareEvent_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareEvent" ADD CONSTRAINT "CareEvent_validatesEventId_fkey" FOREIGN KEY ("validatesEventId") REFERENCES "CareEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareEvent" ADD CONSTRAINT "CareEvent_correctsEventId_fkey" FOREIGN KEY ("correctsEventId") REFERENCES "CareEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareTransfer" ADD CONSTRAINT "CareTransfer_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareTransfer" ADD CONSTRAINT "CareTransfer_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareTransfer" ADD CONSTRAINT "CareTransfer_fromUnitId_fkey" FOREIGN KEY ("fromUnitId") REFERENCES "CareUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareTransfer" ADD CONSTRAINT "CareTransfer_toUnitId_fkey" FOREIGN KEY ("toUnitId") REFERENCES "CareUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareTransfer" ADD CONSTRAINT "CareTransfer_fromEpisodeId_fkey" FOREIGN KEY ("fromEpisodeId") REFERENCES "CareEpisode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareTransfer" ADD CONSTRAINT "CareTransfer_toEpisodeId_fkey" FOREIGN KEY ("toEpisodeId") REFERENCES "CareEpisode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareTransfer" ADD CONSTRAINT "CareTransfer_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareTransfer" ADD CONSTRAINT "CareTransfer_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareTransfer" ADD CONSTRAINT "CareTransfer_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- CareEvent is insert-only. A correction or a validation is a new event that
-- points to the original one, so the original observation always stays readable.
-- Prisma ignores triggers: this protection lives only in the database.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "care_event_is_immutable"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'CareEvent est en ajout seul : % refusé. Enregistrez un événement de correction.', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "CareEvent_insert_only"
  BEFORE UPDATE OR DELETE ON "CareEvent"
  FOR EACH ROW EXECUTE FUNCTION "care_event_is_immutable"();
