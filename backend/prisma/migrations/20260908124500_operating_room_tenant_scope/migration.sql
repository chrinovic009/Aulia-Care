-- Operating rooms are clinical resources of one establishment. The nullable
-- column leaves legacy rows for an explicit integrity repair; routes fail closed.
ALTER TABLE "OperatingRoom" ADD COLUMN "clinicId" TEXT;
ALTER TABLE "OperatingRoom" DROP CONSTRAINT IF EXISTS "OperatingRoom_name_key";
CREATE INDEX "OperatingRoom_clinicId_idx" ON "OperatingRoom"("clinicId");
CREATE UNIQUE INDEX "OperatingRoom_clinicId_name_key" ON "OperatingRoom"("clinicId", "name");
ALTER TABLE "OperatingRoom"
  ADD CONSTRAINT "OperatingRoom_clinicId_fkey"
  FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
