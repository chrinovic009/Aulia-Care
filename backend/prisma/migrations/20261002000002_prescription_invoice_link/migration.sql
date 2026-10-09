ALTER TABLE "Invoice" ADD COLUMN "prescriptionId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "prescriptionVersion" INTEGER;

CREATE INDEX "Invoice_prescriptionId_prescriptionVersion_idx" ON "Invoice"("prescriptionId", "prescriptionVersion");

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
