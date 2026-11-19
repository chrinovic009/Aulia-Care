/*
  Warnings:

  - You are about to drop the `ClinicLabTest` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[clinicId,code]` on the table `LabCategory` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[clinicId,sectionId,name]` on the table `LabCategory` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[clinicId,code]` on the table `LabConsumable` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[clinicId,name]` on the table `LabConsumable` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[clinicId,date]` on the table `LabDailyStatistics` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[clinicId,name]` on the table `LabSampleType` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[clinicId,name]` on the table `LabSection` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[clinicId,code]` on the table `LabTest` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[clinicId,labTestId,labConsumableId]` on the table `LabTestConsumableRequirement` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[clinicId,labTestId,code]` on the table `LabTestParameter` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[clinicId,labTestId,labSampleTypeId]` on the table `LabTestSampleRequirement` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `clinicId` to the `LabCategory` table without a default value. This is not possible if the table is not empty.
  - Made the column `sectionId` on table `LabCategory` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `clinicId` to the `LabConsumable` table without a default value. This is not possible if the table is not empty.
  - Added the required column `clinicId` to the `LabDailyStatistics` table without a default value. This is not possible if the table is not empty.
  - Added the required column `clinicId` to the `LabSampleType` table without a default value. This is not possible if the table is not empty.
  - Added the required column `clinicId` to the `LabSection` table without a default value. This is not possible if the table is not empty.
  - Added the required column `clinicId` to the `LabTest` table without a default value. This is not possible if the table is not empty.
  - Added the required column `clinicId` to the `LabTestConsumableRequirement` table without a default value. This is not possible if the table is not empty.
  - Added the required column `clinicId` to the `LabTestParameter` table without a default value. This is not possible if the table is not empty.
  - Added the required column `clinicId` to the `LabTestSampleRequirement` table without a default value. This is not possible if the table is not empty.

*/
-- ============================================================
-- AULIA CARE
-- Laboratory full tenant ownership
--
-- Legacy laboratory catalogue data is intentionally discarded.
-- The operational laboratory workflow was verified empty before
-- this migration, so the shared test catalogue can be rebuilt
-- independently by each clinic after deployment.
-- ============================================================

-- Remove legacy clinic/test configuration first.
DELETE FROM "ClinicLabTest";

-- Remove child catalogue records before their parents.
DELETE FROM "LabTestConsumableRequirement";
DELETE FROM "LabTestSampleRequirement";
DELETE FROM "LabTestParameter";

-- Remove clinic-owned reference catalogues.
DELETE FROM "LabConsumable";
DELETE FROM "LabSampleType";

-- Remove tests before categories and sections.
DELETE FROM "LabTest";
DELETE FROM "LabCategory";
DELETE FROM "LabSection";

-- Statistics from the former global model cannot be assigned
-- safely to a clinic and are intentionally reset.
DELETE FROM "LabDailyStatistics";

-- DropForeignKey
ALTER TABLE "ClinicLabTest" DROP CONSTRAINT "ClinicLabTest_clinicId_fkey";

-- DropForeignKey
ALTER TABLE "ClinicLabTest" DROP CONSTRAINT "ClinicLabTest_labTestId_fkey";

-- DropForeignKey
ALTER TABLE "LabCategory" DROP CONSTRAINT "LabCategory_sectionId_fkey";

-- DropIndex
DROP INDEX "LabCategory_code_key";

-- DropIndex
DROP INDEX "LabCategory_sectionId_name_key";

-- DropIndex
DROP INDEX "LabConsumable_code_key";

-- DropIndex
DROP INDEX "LabDailyStatistics_date_key";

-- DropIndex
DROP INDEX "LabSampleType_name_key";

-- DropIndex
DROP INDEX "LabSection_name_key";

-- DropIndex
DROP INDEX "LabTest_categoryId_idx";

-- DropIndex
DROP INDEX "LabTest_code_key";

-- DropIndex
DROP INDEX "MedicationStock_medicationId_idx";

-- AlterTable
ALTER TABLE "LabCategory" ADD COLUMN     "clinicId" TEXT NOT NULL,
ALTER COLUMN "sectionId" SET NOT NULL,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "LabConsumable" ADD COLUMN     "clinicId" TEXT NOT NULL,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "LabDailyStatistics" ADD COLUMN     "clinicId" TEXT NOT NULL,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "LabSampleType" ADD COLUMN     "clinicId" TEXT NOT NULL,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "LabSection" ADD COLUMN     "clinicId" TEXT NOT NULL,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "LabTest" ADD COLUMN     "clinicId" TEXT NOT NULL,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "LabTestConsumableRequirement" ADD COLUMN     "clinicId" TEXT NOT NULL,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "LabTestParameter" ADD COLUMN     "clinicId" TEXT NOT NULL,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "LabTestSampleRequirement" ADD COLUMN     "clinicId" TEXT NOT NULL,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- DropTable
DROP TABLE "ClinicLabTest";

-- CreateIndex
CREATE INDEX "LabCategory_clinicId_active_order_idx" ON "LabCategory"("clinicId", "active", "order");

-- CreateIndex
CREATE INDEX "LabCategory_sectionId_idx" ON "LabCategory"("sectionId");

-- CreateIndex
CREATE UNIQUE INDEX "LabCategory_clinicId_code_key" ON "LabCategory"("clinicId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "LabCategory_clinicId_sectionId_name_key" ON "LabCategory"("clinicId", "sectionId", "name");

-- CreateIndex
CREATE INDEX "LabConsumable_clinicId_active_idx" ON "LabConsumable"("clinicId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "LabConsumable_clinicId_code_key" ON "LabConsumable"("clinicId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "LabConsumable_clinicId_name_key" ON "LabConsumable"("clinicId", "name");

-- CreateIndex
CREATE INDEX "LabDailyStatistics_clinicId_date_idx" ON "LabDailyStatistics"("clinicId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "LabDailyStatistics_clinicId_date_key" ON "LabDailyStatistics"("clinicId", "date");

-- CreateIndex
CREATE INDEX "LabSampleType_clinicId_active_idx" ON "LabSampleType"("clinicId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "LabSampleType_clinicId_name_key" ON "LabSampleType"("clinicId", "name");

-- CreateIndex
CREATE INDEX "LabSection_clinicId_active_order_idx" ON "LabSection"("clinicId", "active", "order");

-- CreateIndex
CREATE UNIQUE INDEX "LabSection_clinicId_name_key" ON "LabSection"("clinicId", "name");

-- CreateIndex
CREATE INDEX "LabTest_clinicId_active_idx" ON "LabTest"("clinicId", "active");

-- CreateIndex
CREATE INDEX "LabTest_clinicId_categoryId_idx" ON "LabTest"("clinicId", "categoryId");

-- CreateIndex
CREATE INDEX "LabTest_clinicId_sectionId_idx" ON "LabTest"("clinicId", "sectionId");

-- CreateIndex
CREATE UNIQUE INDEX "LabTest_clinicId_code_key" ON "LabTest"("clinicId", "code");

-- CreateIndex
CREATE INDEX "LabTestConsumableRequirement_clinicId_idx" ON "LabTestConsumableRequirement"("clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "LabTestConsumableRequirement_clinicId_labTestId_labConsumab_key" ON "LabTestConsumableRequirement"("clinicId", "labTestId", "labConsumableId");

-- CreateIndex
CREATE INDEX "LabTestParameter_clinicId_active_idx" ON "LabTestParameter"("clinicId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "LabTestParameter_clinicId_labTestId_code_key" ON "LabTestParameter"("clinicId", "labTestId", "code");

-- CreateIndex
CREATE INDEX "LabTestSampleRequirement_clinicId_idx" ON "LabTestSampleRequirement"("clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "LabTestSampleRequirement_clinicId_labTestId_labSampleTypeId_key" ON "LabTestSampleRequirement"("clinicId", "labTestId", "labSampleTypeId");

-- CreateIndex
CREATE INDEX "MedicationStock_clinicId_medicationId_idx" ON "MedicationStock"("clinicId", "medicationId");

-- AddForeignKey
ALTER TABLE "LabSampleType" ADD CONSTRAINT "LabSampleType_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabSection" ADD CONSTRAINT "LabSection_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabCategory" ADD CONSTRAINT "LabCategory_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabCategory" ADD CONSTRAINT "LabCategory_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "LabSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabTest" ADD CONSTRAINT "LabTest_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabTestParameter" ADD CONSTRAINT "LabTestParameter_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabTestSampleRequirement" ADD CONSTRAINT "LabTestSampleRequirement_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabConsumable" ADD CONSTRAINT "LabConsumable_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabTestConsumableRequirement" ADD CONSTRAINT "LabTestConsumableRequirement_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabDailyStatistics" ADD CONSTRAINT "LabDailyStatistics_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
