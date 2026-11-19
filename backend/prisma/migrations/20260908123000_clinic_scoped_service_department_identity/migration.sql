-- Service and department names are configuration owned by a clinic.  The
-- former global constraints prevented a second clinic from creating its own
-- “Réception”, “Laboratoire”, or reception admission fee service.
-- Existing global uniqueness guarantees these new per-clinic indexes begin
-- without duplicate data.  NULL legacy clinic rows remain explicitly legacy.
ALTER TABLE "Service" DROP CONSTRAINT IF EXISTS "Service_name_key";
CREATE UNIQUE INDEX "Service_clinicId_name_key"
  ON "Service"("clinicId", "name");

ALTER TABLE "Department" DROP CONSTRAINT IF EXISTS "Department_name_key";
ALTER TABLE "Department" DROP CONSTRAINT IF EXISTS "Department_code_key";
CREATE UNIQUE INDEX "Department_clinicId_name_key"
  ON "Department"("clinicId", "name");
CREATE UNIQUE INDEX "Department_clinicId_code_key"
  ON "Department"("clinicId", "code");
