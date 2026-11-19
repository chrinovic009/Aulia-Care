-- Historical invoiceId values may identify either a source or a consolidated
-- invoice. Do not infer provenance or backfill them in this migration.
ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'COVERED';

ALTER TABLE "SubscriptionCharge"
  ADD COLUMN "sourceInvoiceId" TEXT,
  ADD COLUMN "monthlyInvoiceId" TEXT;

CREATE UNIQUE INDEX "SubscriptionCharge_sourceInvoiceId_key"
  ON "SubscriptionCharge"("sourceInvoiceId");
CREATE INDEX "SubscriptionCharge_monthlyInvoiceId_idx"
  ON "SubscriptionCharge"("monthlyInvoiceId");

ALTER TABLE "SubscriptionCharge"
  ADD CONSTRAINT "SubscriptionCharge_sourceInvoiceId_fkey"
  FOREIGN KEY ("sourceInvoiceId") REFERENCES "Invoice"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubscriptionCharge"
  ADD CONSTRAINT "SubscriptionCharge_monthlyInvoiceId_fkey"
  FOREIGN KEY ("monthlyInvoiceId") REFERENCES "Invoice"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
