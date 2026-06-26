/*
  Warnings:

  - The values [IN_PROGRESS] on the enum `LabRequestStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `verified` on the `LabResult` table. All the data in the column will be lost.
  - You are about to drop the column `verifiedAt` on the `LabResult` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[accessionNumber]` on the table `LabRequest` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "LabResultType" AS ENUM ('NUMERIC', 'TEXT', 'SIMPLE', 'MULTI_PARAMETER');

-- CreateEnum
CREATE TYPE "GenderRestriction" AS ENUM ('ALL', 'MALE', 'FEMALE', 'UNSPECIFIED');

-- CreateEnum
CREATE TYPE "LabRequestItemStatus" AS ENUM ('REQUESTED', 'COLLECTED', 'RECEIVED', 'IN_ANALYSIS', 'TECHNICAL_VALIDATION', 'BIOLOGICAL_VALIDATION', 'AVAILABLE', 'SENT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LabSampleStatus" AS ENUM ('COLLECTED', 'IN_TRANSIT', 'RECEIVED', 'STORED', 'REJECTED', 'DISCARDED');

-- CreateEnum
CREATE TYPE "LabResultValidationStatus" AS ENUM ('PENDING', 'TECHNICAL_VALIDATED', 'BIOLOGICALLY_VALIDATED', 'REJECTED', 'CORRECTION_REQUESTED');

-- CreateEnum
CREATE TYPE "LabStaffRole" AS ENUM ('LAB_MANAGER', 'LAB_TECHNICIAN');

-- CreateEnum
CREATE TYPE "LabConsumableTransactionType" AS ENUM ('IN', 'OUT', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "LabReportStatus" AS ENUM ('DRAFT', 'FINALIZED', 'PUBLISHED');

-- AlterEnum
BEGIN;
CREATE TYPE "LabRequestStatus_new" AS ENUM ('REQUESTED', 'COLLECTED', 'RECEIVED', 'IN_ANALYSIS', 'TECHNICAL_VALIDATION', 'BIOLOGICAL_VALIDATION', 'AVAILABLE', 'SENT', 'COMPLETED', 'VERIFIED', 'CANCELLED');
ALTER TABLE "LabRequest" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "LabRequest" ALTER COLUMN "status" TYPE "LabRequestStatus_new" USING ("status"::text::"LabRequestStatus_new");
ALTER TYPE "LabRequestStatus" RENAME TO "LabRequestStatus_old";
ALTER TYPE "LabRequestStatus_new" RENAME TO "LabRequestStatus";
DROP TYPE "LabRequestStatus_old";
ALTER TABLE "LabRequest" ALTER COLUMN "status" SET DEFAULT 'REQUESTED';
COMMIT;

-- AlterEnum
ALTER TYPE "RoleSlug" ADD VALUE 'LAB_MANAGER';

-- AlterTable
ALTER TABLE "LabRequest" ADD COLUMN     "accessionNumber" TEXT,
ADD COLUMN     "clinicId" TEXT,
ADD COLUMN     "externalReference" TEXT,
ADD COLUMN     "receivedAt" TIMESTAMP(3),
ADD COLUMN     "sentAt" TIMESTAMP(3),
ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "LabResult" DROP COLUMN "verified",
DROP COLUMN "verifiedAt",
ADD COLUMN     "biologicalValidatedById" TEXT,
ADD COLUMN     "biologicalValidationAt" TIMESTAMP(3),
ADD COLUMN     "comments" TEXT,
ADD COLUMN     "labRequestItemId" TEXT,
ADD COLUMN     "numericValue" DECIMAL(12,4),
ADD COLUMN     "resultStatus" "LabResultValidationStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "resultType" "LabResultType" NOT NULL DEFAULT 'MULTI_PARAMETER',
ADD COLUMN     "technicalValidatedById" TEXT,
ADD COLUMN     "technicalValidationAt" TIMESTAMP(3),
ADD COLUMN     "textValue" TEXT,
ALTER COLUMN "resultValue" DROP NOT NULL,
ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "LabRequestItem" (
    "id" TEXT NOT NULL,
    "labRequestId" TEXT NOT NULL,
    "labTestId" TEXT NOT NULL,
    "sampleTypeId" TEXT,
    "status" "LabRequestItemStatus" NOT NULL DEFAULT 'REQUESTED',
    "specimenLabel" TEXT,
    "assignedToId" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "collectedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "analysisStartedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3),
    "sourceNode" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "LabRequestItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabSampleType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabSampleType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabSample" (
    "id" TEXT NOT NULL,
    "labRequestId" TEXT NOT NULL,
    "labRequestItemId" TEXT,
    "labSampleTypeId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "barcode" TEXT NOT NULL,
    "collectedById" TEXT,
    "collectedAt" TIMESTAMP(3),
    "volume" DECIMAL(12,2),
    "volumeUnit" TEXT DEFAULT 'mL',
    "condition" TEXT,
    "storageLocation" TEXT,
    "status" "LabSampleStatus" NOT NULL DEFAULT 'COLLECTED',
    "receivedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3),
    "sourceNode" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "LabSample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabSampleTrackingEvent" (
    "id" TEXT NOT NULL,
    "labSampleId" TEXT NOT NULL,
    "status" "LabSampleStatus" NOT NULL,
    "performedById" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabSampleTrackingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabRequestEvent" (
    "id" TEXT NOT NULL,
    "labRequestId" TEXT NOT NULL,
    "labRequestItemId" TEXT,
    "action" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "performedById" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabRequestEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabResultParameter" (
    "id" TEXT NOT NULL,
    "labResultId" TEXT NOT NULL,
    "labTestParameterId" TEXT,
    "valueNumeric" DECIMAL(12,4),
    "valueText" TEXT,
    "interpretation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabResultParameter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabSection" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabCategory" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabTest" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "sectionId" TEXT,
    "description" TEXT,
    "price" DECIMAL(12,2) NOT NULL,
    "turnaroundTimeMinutes" INTEGER,
    "resultType" "LabResultType" NOT NULL DEFAULT 'MULTI_PARAMETER',
    "unit" TEXT,
    "referenceRange" TEXT,
    "genderRestriction" "GenderRestriction" NOT NULL DEFAULT 'ALL',
    "minAge" INTEGER,
    "maxAge" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabTestParameter" (
    "id" TEXT NOT NULL,
    "labTestId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT,
    "resultType" "LabResultType" NOT NULL DEFAULT 'NUMERIC',
    "referenceRange" TEXT,
    "minValue" DECIMAL(12,4),
    "maxValue" DECIMAL(12,4),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabTestParameter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabTestSampleRequirement" (
    "id" TEXT NOT NULL,
    "labTestId" TEXT NOT NULL,
    "labSampleTypeId" TEXT NOT NULL,
    "volumeRequired" DECIMAL(12,2),
    "volumeUnit" TEXT DEFAULT 'mL',
    "storageCondition" TEXT,
    "maxAgeMinutes" INTEGER,
    "instructions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabTestSampleRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabConsumable" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "unit" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabConsumable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabTestConsumableRequirement" (
    "id" TEXT NOT NULL,
    "labTestId" TEXT NOT NULL,
    "labConsumableId" TEXT NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,
    "unit" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabTestConsumableRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabConsumableStock" (
    "id" TEXT NOT NULL,
    "labConsumableId" TEXT NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "minimumLevel" DECIMAL(12,2),
    "criticalLevel" DECIMAL(12,2),
    "location" TEXT,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedById" TEXT,

    CONSTRAINT "LabConsumableStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabConsumableTransaction" (
    "id" TEXT NOT NULL,
    "labConsumableId" TEXT NOT NULL,
    "type" "LabConsumableTransactionType" NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,
    "unit" TEXT NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "performedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabConsumableTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabReport" (
    "id" TEXT NOT NULL,
    "labRequestId" TEXT NOT NULL,
    "labRequestItemId" TEXT,
    "title" TEXT NOT NULL,
    "status" "LabReportStatus" NOT NULL DEFAULT 'DRAFT',
    "summary" TEXT,
    "reportUrl" TEXT,
    "issuedById" TEXT,
    "generatedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabSectionStaff" (
    "id" TEXT NOT NULL,
    "labSectionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "LabStaffRole" NOT NULL DEFAULT 'LAB_TECHNICIAN',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabSectionStaff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabConfiguration" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabDailyStatistics" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "requestsCount" INTEGER NOT NULL DEFAULT 0,
    "testsPerformed" INTEGER NOT NULL DEFAULT 0,
    "revenue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "validatedCount" INTEGER NOT NULL DEFAULT 0,
    "rejectedCount" INTEGER NOT NULL DEFAULT 0,
    "averageTurnaroundMins" INTEGER,
    "technicianMetrics" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabDailyStatistics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LabRequestItem_labRequestId_idx" ON "LabRequestItem"("labRequestId");

-- CreateIndex
CREATE INDEX "LabRequestItem_labTestId_idx" ON "LabRequestItem"("labTestId");

-- CreateIndex
CREATE INDEX "LabRequestItem_status_idx" ON "LabRequestItem"("status");

-- CreateIndex
CREATE UNIQUE INDEX "LabSampleType_name_key" ON "LabSampleType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "LabSample_externalId_key" ON "LabSample"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "LabSample_barcode_key" ON "LabSample"("barcode");

-- CreateIndex
CREATE INDEX "LabSample_labRequestId_idx" ON "LabSample"("labRequestId");

-- CreateIndex
CREATE INDEX "LabSample_labRequestItemId_idx" ON "LabSample"("labRequestItemId");

-- CreateIndex
CREATE INDEX "LabSample_labSampleTypeId_idx" ON "LabSample"("labSampleTypeId");

-- CreateIndex
CREATE INDEX "LabSampleTrackingEvent_labSampleId_idx" ON "LabSampleTrackingEvent"("labSampleId");

-- CreateIndex
CREATE INDEX "LabRequestEvent_labRequestId_idx" ON "LabRequestEvent"("labRequestId");

-- CreateIndex
CREATE INDEX "LabRequestEvent_labRequestItemId_idx" ON "LabRequestEvent"("labRequestItemId");

-- CreateIndex
CREATE INDEX "LabResultParameter_labResultId_idx" ON "LabResultParameter"("labResultId");

-- CreateIndex
CREATE INDEX "LabResultParameter_labTestParameterId_idx" ON "LabResultParameter"("labTestParameterId");

-- CreateIndex
CREATE UNIQUE INDEX "LabSection_name_key" ON "LabSection"("name");

-- CreateIndex
CREATE UNIQUE INDEX "LabCategory_code_key" ON "LabCategory"("code");

-- CreateIndex
CREATE UNIQUE INDEX "LabCategory_sectionId_name_key" ON "LabCategory"("sectionId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "LabTest_code_key" ON "LabTest"("code");

-- CreateIndex
CREATE INDEX "LabTest_categoryId_idx" ON "LabTest"("categoryId");

-- CreateIndex
CREATE INDEX "LabTestParameter_labTestId_idx" ON "LabTestParameter"("labTestId");

-- CreateIndex
CREATE INDEX "LabTestSampleRequirement_labTestId_idx" ON "LabTestSampleRequirement"("labTestId");

-- CreateIndex
CREATE INDEX "LabTestSampleRequirement_labSampleTypeId_idx" ON "LabTestSampleRequirement"("labSampleTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "LabConsumable_code_key" ON "LabConsumable"("code");

-- CreateIndex
CREATE INDEX "LabTestConsumableRequirement_labTestId_idx" ON "LabTestConsumableRequirement"("labTestId");

-- CreateIndex
CREATE INDEX "LabTestConsumableRequirement_labConsumableId_idx" ON "LabTestConsumableRequirement"("labConsumableId");

-- CreateIndex
CREATE INDEX "LabConsumableStock_labConsumableId_idx" ON "LabConsumableStock"("labConsumableId");

-- CreateIndex
CREATE INDEX "LabConsumableTransaction_labConsumableId_idx" ON "LabConsumableTransaction"("labConsumableId");

-- CreateIndex
CREATE INDEX "LabReport_labRequestId_idx" ON "LabReport"("labRequestId");

-- CreateIndex
CREATE INDEX "LabReport_labRequestItemId_idx" ON "LabReport"("labRequestItemId");

-- CreateIndex
CREATE UNIQUE INDEX "LabSectionStaff_labSectionId_userId_key" ON "LabSectionStaff"("labSectionId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "LabConfiguration_key_key" ON "LabConfiguration"("key");

-- CreateIndex
CREATE UNIQUE INDEX "LabDailyStatistics_date_key" ON "LabDailyStatistics"("date");

-- CreateIndex
CREATE UNIQUE INDEX "LabRequest_accessionNumber_key" ON "LabRequest"("accessionNumber");

-- CreateIndex
CREATE INDEX "LabRequest_clinicId_idx" ON "LabRequest"("clinicId");

-- CreateIndex
CREATE INDEX "LabResult_labRequestItemId_idx" ON "LabResult"("labRequestItemId");

-- AddForeignKey
ALTER TABLE "LabRequestItem" ADD CONSTRAINT "LabRequestItem_labRequestId_fkey" FOREIGN KEY ("labRequestId") REFERENCES "LabRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabRequestItem" ADD CONSTRAINT "LabRequestItem_labTestId_fkey" FOREIGN KEY ("labTestId") REFERENCES "LabTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabRequestItem" ADD CONSTRAINT "LabRequestItem_sampleTypeId_fkey" FOREIGN KEY ("sampleTypeId") REFERENCES "LabSampleType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabRequestItem" ADD CONSTRAINT "LabRequestItem_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabSample" ADD CONSTRAINT "LabSample_labRequestId_fkey" FOREIGN KEY ("labRequestId") REFERENCES "LabRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabSample" ADD CONSTRAINT "LabSample_labRequestItemId_fkey" FOREIGN KEY ("labRequestItemId") REFERENCES "LabRequestItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabSample" ADD CONSTRAINT "LabSample_labSampleTypeId_fkey" FOREIGN KEY ("labSampleTypeId") REFERENCES "LabSampleType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabSample" ADD CONSTRAINT "LabSample_collectedById_fkey" FOREIGN KEY ("collectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabSampleTrackingEvent" ADD CONSTRAINT "LabSampleTrackingEvent_labSampleId_fkey" FOREIGN KEY ("labSampleId") REFERENCES "LabSample"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabSampleTrackingEvent" ADD CONSTRAINT "LabSampleTrackingEvent_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabRequestEvent" ADD CONSTRAINT "LabRequestEvent_labRequestId_fkey" FOREIGN KEY ("labRequestId") REFERENCES "LabRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabRequestEvent" ADD CONSTRAINT "LabRequestEvent_labRequestItemId_fkey" FOREIGN KEY ("labRequestItemId") REFERENCES "LabRequestItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabRequestEvent" ADD CONSTRAINT "LabRequestEvent_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabResult" ADD CONSTRAINT "LabResult_labRequestItemId_fkey" FOREIGN KEY ("labRequestItemId") REFERENCES "LabRequestItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabResult" ADD CONSTRAINT "LabResult_technicalValidatedById_fkey" FOREIGN KEY ("technicalValidatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabResult" ADD CONSTRAINT "LabResult_biologicalValidatedById_fkey" FOREIGN KEY ("biologicalValidatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabResultParameter" ADD CONSTRAINT "LabResultParameter_labResultId_fkey" FOREIGN KEY ("labResultId") REFERENCES "LabResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabResultParameter" ADD CONSTRAINT "LabResultParameter_labTestParameterId_fkey" FOREIGN KEY ("labTestParameterId") REFERENCES "LabTestParameter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabCategory" ADD CONSTRAINT "LabCategory_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "LabSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabTest" ADD CONSTRAINT "LabTest_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "LabCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabTest" ADD CONSTRAINT "LabTest_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "LabSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabTest" ADD CONSTRAINT "LabTest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabTest" ADD CONSTRAINT "LabTest_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabTestParameter" ADD CONSTRAINT "LabTestParameter_labTestId_fkey" FOREIGN KEY ("labTestId") REFERENCES "LabTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabTestSampleRequirement" ADD CONSTRAINT "LabTestSampleRequirement_labTestId_fkey" FOREIGN KEY ("labTestId") REFERENCES "LabTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabTestSampleRequirement" ADD CONSTRAINT "LabTestSampleRequirement_labSampleTypeId_fkey" FOREIGN KEY ("labSampleTypeId") REFERENCES "LabSampleType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabTestConsumableRequirement" ADD CONSTRAINT "LabTestConsumableRequirement_labTestId_fkey" FOREIGN KEY ("labTestId") REFERENCES "LabTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabTestConsumableRequirement" ADD CONSTRAINT "LabTestConsumableRequirement_labConsumableId_fkey" FOREIGN KEY ("labConsumableId") REFERENCES "LabConsumable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabConsumableStock" ADD CONSTRAINT "LabConsumableStock_labConsumableId_fkey" FOREIGN KEY ("labConsumableId") REFERENCES "LabConsumable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabConsumableStock" ADD CONSTRAINT "LabConsumableStock_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabConsumableTransaction" ADD CONSTRAINT "LabConsumableTransaction_labConsumableId_fkey" FOREIGN KEY ("labConsumableId") REFERENCES "LabConsumable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabConsumableTransaction" ADD CONSTRAINT "LabConsumableTransaction_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabReport" ADD CONSTRAINT "LabReport_labRequestId_fkey" FOREIGN KEY ("labRequestId") REFERENCES "LabRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabReport" ADD CONSTRAINT "LabReport_labRequestItemId_fkey" FOREIGN KEY ("labRequestItemId") REFERENCES "LabRequestItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabReport" ADD CONSTRAINT "LabReport_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabSectionStaff" ADD CONSTRAINT "LabSectionStaff_labSectionId_fkey" FOREIGN KEY ("labSectionId") REFERENCES "LabSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabSectionStaff" ADD CONSTRAINT "LabSectionStaff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
