-- Radiology catalogue and equipment. This migration is additive: existing imaging
-- requests and reports remain intact.
CREATE TABLE IF NOT EXISTS "ImagingCatalogue" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "modality" TEXT NOT NULL,
    "description" TEXT,
    "preparationInstructions" TEXT,
    "price" DECIMAL(12,2) NOT NULL,
    "turnaroundTimeMinutes" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3),
    "sourceNode" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "ImagingCatalogue_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ImagingMachine" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "roomNumber" TEXT,
    "isOperational" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3),
    "sourceNode" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "ImagingMachine_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ImagingRequest" ADD COLUMN IF NOT EXISTS "imagingCatalogueId" TEXT;
ALTER TABLE "ImagingRequest" ADD COLUMN IF NOT EXISTS "machineId" TEXT;
ALTER TABLE "ImagingRequest" ADD COLUMN IF NOT EXISTS "technicianId" TEXT;
ALTER TABLE "ImagingRequest" ADD COLUMN IF NOT EXISTS "contrastAgentUsed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ImagingRequest" ADD COLUMN IF NOT EXISTS "contrastDetails" TEXT;

ALTER TABLE "ImagingReport" ADD COLUMN IF NOT EXISTS "radiologistId" TEXT;
ALTER TABLE "ImagingReport" ADD COLUMN IF NOT EXISTS "technicianNotes" TEXT;
ALTER TABLE "ImagingReport" ADD COLUMN IF NOT EXISTS "dicomStudyInstanceUid" TEXT;
ALTER TABLE "ImagingReport" ADD COLUMN IF NOT EXISTS "imagePaths" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE UNIQUE INDEX IF NOT EXISTS "ImagingCatalogue_code_key" ON "ImagingCatalogue"("code");
CREATE INDEX IF NOT EXISTS "ImagingCatalogue_active_idx" ON "ImagingCatalogue"("active");
CREATE INDEX IF NOT EXISTS "ImagingCatalogue_modality_idx" ON "ImagingCatalogue"("modality");
CREATE INDEX IF NOT EXISTS "ImagingMachine_isOperational_idx" ON "ImagingMachine"("isOperational");
CREATE INDEX IF NOT EXISTS "ImagingRequest_imagingCatalogueId_idx" ON "ImagingRequest"("imagingCatalogueId");
CREATE INDEX IF NOT EXISTS "ImagingRequest_machineId_idx" ON "ImagingRequest"("machineId");
CREATE INDEX IF NOT EXISTS "ImagingRequest_technicianId_idx" ON "ImagingRequest"("technicianId");
CREATE INDEX IF NOT EXISTS "ImagingReport_radiologistId_idx" ON "ImagingReport"("radiologistId");
CREATE UNIQUE INDEX IF NOT EXISTS "ImagingReport_dicomStudyInstanceUid_key" ON "ImagingReport"("dicomStudyInstanceUid") WHERE "dicomStudyInstanceUid" IS NOT NULL;

DO $$ BEGIN
  ALTER TABLE "ImagingRequest" ADD CONSTRAINT "ImagingRequest_imagingCatalogueId_fkey" FOREIGN KEY ("imagingCatalogueId") REFERENCES "ImagingCatalogue"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ImagingRequest" ADD CONSTRAINT "ImagingRequest_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "ImagingMachine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ImagingRequest" ADD CONSTRAINT "ImagingRequest_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ImagingReport" ADD CONSTRAINT "ImagingReport_radiologistId_fkey" FOREIGN KEY ("radiologistId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
