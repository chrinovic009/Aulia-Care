-- Connected Care commercial configuration and inventory are owned by one
-- establishment. Existing rows remain unassigned until an explicit integrity
-- repair; no historical stock is guessed to belong to a clinic.
ALTER TABLE "WearablePlan" ADD COLUMN "clinicId" TEXT;
ALTER TABLE "WearableLot" ADD COLUMN "clinicId" TEXT;

ALTER TABLE "WearablePlan" DROP CONSTRAINT IF EXISTS "WearablePlan_manufacturer_key";
ALTER TABLE "WearableLot" DROP CONSTRAINT IF EXISTS "WearableLot_reference_key";

CREATE UNIQUE INDEX "WearablePlan_clinicId_manufacturer_key"
  ON "WearablePlan"("clinicId", "manufacturer");
CREATE INDEX "WearablePlan_clinicId_active_idx"
  ON "WearablePlan"("clinicId", "active");

CREATE UNIQUE INDEX "WearableLot_clinicId_reference_key"
  ON "WearableLot"("clinicId", "reference");
CREATE INDEX "WearableLot_clinicId_manufacturer_receivedAt_idx"
  ON "WearableLot"("clinicId", "manufacturer", "receivedAt");

ALTER TABLE "WearablePlan"
  ADD CONSTRAINT "WearablePlan_clinicId_fkey"
  FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WearableLot"
  ADD CONSTRAINT "WearableLot_clinicId_fkey"
  FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
