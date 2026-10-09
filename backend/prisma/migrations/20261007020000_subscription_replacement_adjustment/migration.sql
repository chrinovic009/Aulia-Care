ALTER TABLE "SubscriptionCharge" ADD COLUMN "prescriptionReplacementId" TEXT;

CREATE UNIQUE INDEX "SubscriptionCharge_prescriptionReplacementId_key"
  ON "SubscriptionCharge"("prescriptionReplacementId");

ALTER TABLE "SubscriptionCharge"
  ADD CONSTRAINT "SubscriptionCharge_prescriptionReplacementId_fkey"
  FOREIGN KEY ("prescriptionReplacementId") REFERENCES "PrescriptionReplacement"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
