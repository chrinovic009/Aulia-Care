-- Tenant-bound imaging configuration. Existing legacy rows remain NULL and
-- are intentionally not assigned to an arbitrary clinic.
ALTER TABLE "ImagingCatalogue" ADD COLUMN "clinicId" TEXT;
ALTER TABLE "ImagingMachine" ADD COLUMN "clinicId" TEXT;

ALTER TABLE "ImagingCatalogue" DROP CONSTRAINT IF EXISTS "ImagingCatalogue_code_key";
CREATE UNIQUE INDEX "ImagingCatalogue_clinicId_code_key"
  ON "ImagingCatalogue"("clinicId", "code");
CREATE INDEX "ImagingCatalogue_clinicId_active_idx"
  ON "ImagingCatalogue"("clinicId", "active");

CREATE UNIQUE INDEX "ImagingMachine_clinicId_name_key"
  ON "ImagingMachine"("clinicId", "name");
CREATE INDEX "ImagingMachine_clinicId_isOperational_idx"
  ON "ImagingMachine"("clinicId", "isOperational");

ALTER TABLE "ImagingCatalogue"
  ADD CONSTRAINT "ImagingCatalogue_clinicId_fkey"
  FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ImagingMachine"
  ADD CONSTRAINT "ImagingMachine_clinicId_fkey"
  FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
