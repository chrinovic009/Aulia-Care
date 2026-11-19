-- Safety gate: these tables are intentionally empty in the local Aulia Care datasets.
-- If a database contains rows here, the migration refuses to guess a tenant and requires a manual repair.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Supplier") THEN
    RAISE EXCEPTION 'Supplier contains rows; tenant assignment repair is required before enforcing clinicId NOT NULL.';
  END IF;
  IF EXISTS (SELECT 1 FROM "MedicationStock") THEN
    RAISE EXCEPTION 'MedicationStock contains rows; tenant assignment repair is required before enforcing clinicId NOT NULL.';
  END IF;
  IF EXISTS (SELECT 1 FROM "StockMovement") THEN
    RAISE EXCEPTION 'StockMovement contains rows; tenant assignment repair is required before enforcing clinicId NOT NULL.';
  END IF;
  IF EXISTS (SELECT 1 FROM "PurchaseOrder") THEN
    RAISE EXCEPTION 'PurchaseOrder contains rows; tenant assignment repair is required before enforcing clinicId NOT NULL.';
  END IF;
  IF EXISTS (SELECT 1 FROM "GoodsReceipt") THEN
    RAISE EXCEPTION 'GoodsReceipt contains rows; tenant assignment repair is required before enforcing clinicId NOT NULL.';
  END IF;
  IF EXISTS (SELECT 1 FROM "SupplierInvoice") THEN
    RAISE EXCEPTION 'SupplierInvoice contains rows; tenant assignment repair is required before enforcing clinicId NOT NULL.';
  END IF;
  IF EXISTS (SELECT 1 FROM "SupplierPayment") THEN
    RAISE EXCEPTION 'SupplierPayment contains rows; tenant assignment repair is required before enforcing clinicId NOT NULL.';
  END IF;
  IF EXISTS (SELECT 1 FROM "StockLot") THEN
    RAISE EXCEPTION 'StockLot contains rows; tenant assignment repair is required before enforcing clinicId NOT NULL.';
  END IF;
  IF EXISTS (SELECT 1 FROM "StockTransaction") THEN
    RAISE EXCEPTION 'StockTransaction contains rows; tenant assignment repair is required before enforcing clinicId NOT NULL.';
  END IF;
  IF EXISTS (SELECT 1 FROM "PharmacyDispense") THEN
    RAISE EXCEPTION 'PharmacyDispense contains rows; tenant assignment repair is required before enforcing clinicId NOT NULL.';
  END IF;
END $$;

ALTER TABLE "Supplier"
  ADD COLUMN IF NOT EXISTS "clinicId" TEXT;

ALTER TABLE "MedicationStock"
  ADD COLUMN IF NOT EXISTS "clinicId" TEXT;

ALTER TABLE "StockMovement"
  ADD COLUMN IF NOT EXISTS "clinicId" TEXT;

ALTER TABLE "PurchaseOrder"
  ADD COLUMN IF NOT EXISTS "clinicId" TEXT;

ALTER TABLE "GoodsReceipt"
  ADD COLUMN IF NOT EXISTS "clinicId" TEXT;

ALTER TABLE "SupplierInvoice"
  ADD COLUMN IF NOT EXISTS "clinicId" TEXT;

ALTER TABLE "SupplierPayment"
  ADD COLUMN IF NOT EXISTS "clinicId" TEXT;

ALTER TABLE "StockLot"
  ADD COLUMN IF NOT EXISTS "clinicId" TEXT;

ALTER TABLE "StockTransaction"
  ADD COLUMN IF NOT EXISTS "clinicId" TEXT;

ALTER TABLE "PharmacyDispense"
  ADD COLUMN IF NOT EXISTS "clinicId" TEXT;

-- The local repository confirms these tenant-owned tables are empty, so they can be hardened immediately.
-- Production or shared databases with populated data must assign the tenant explicitly before this migration is run.
ALTER TABLE "Supplier"
  ALTER COLUMN "clinicId" SET NOT NULL;
ALTER TABLE "MedicationStock"
  ALTER COLUMN "clinicId" SET NOT NULL;
ALTER TABLE "StockMovement"
  ALTER COLUMN "clinicId" SET NOT NULL;
ALTER TABLE "PurchaseOrder"
  ALTER COLUMN "clinicId" SET NOT NULL;
ALTER TABLE "GoodsReceipt"
  ALTER COLUMN "clinicId" SET NOT NULL;
ALTER TABLE "SupplierInvoice"
  ALTER COLUMN "clinicId" SET NOT NULL;
ALTER TABLE "SupplierPayment"
  ALTER COLUMN "clinicId" SET NOT NULL;
ALTER TABLE "StockLot"
  ALTER COLUMN "clinicId" SET NOT NULL;
ALTER TABLE "StockTransaction"
  ALTER COLUMN "clinicId" SET NOT NULL;
ALTER TABLE "PharmacyDispense"
  ALTER COLUMN "clinicId" SET NOT NULL;

-- Earlier baseline migrations created nullable foreign keys for several of
-- these columns. Replace them explicitly, after the empty-table safety gate,
-- rather than attempting to add duplicate constraints on a clean install.
ALTER TABLE "Supplier" DROP CONSTRAINT IF EXISTS "Supplier_clinicId_fkey";
ALTER TABLE "MedicationStock" DROP CONSTRAINT IF EXISTS "MedicationStock_clinicId_fkey";
ALTER TABLE "StockMovement" DROP CONSTRAINT IF EXISTS "StockMovement_clinicId_fkey";
ALTER TABLE "PurchaseOrder" DROP CONSTRAINT IF EXISTS "PurchaseOrder_clinicId_fkey";
ALTER TABLE "GoodsReceipt" DROP CONSTRAINT IF EXISTS "GoodsReceipt_clinicId_fkey";
ALTER TABLE "SupplierInvoice" DROP CONSTRAINT IF EXISTS "SupplierInvoice_clinicId_fkey";
ALTER TABLE "SupplierPayment" DROP CONSTRAINT IF EXISTS "SupplierPayment_clinicId_fkey";
ALTER TABLE "StockLot" DROP CONSTRAINT IF EXISTS "StockLot_clinicId_fkey";
ALTER TABLE "StockTransaction" DROP CONSTRAINT IF EXISTS "StockTransaction_clinicId_fkey";
ALTER TABLE "PharmacyDispense" DROP CONSTRAINT IF EXISTS "PharmacyDispense_clinicId_fkey";

ALTER TABLE "Supplier"
  ADD CONSTRAINT "Supplier_clinicId_fkey"
  FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MedicationStock"
  ADD CONSTRAINT "MedicationStock_clinicId_fkey"
  FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StockMovement"
  ADD CONSTRAINT "StockMovement_clinicId_fkey"
  FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PurchaseOrder"
  ADD CONSTRAINT "PurchaseOrder_clinicId_fkey"
  FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GoodsReceipt"
  ADD CONSTRAINT "GoodsReceipt_clinicId_fkey"
  FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SupplierInvoice"
  ADD CONSTRAINT "SupplierInvoice_clinicId_fkey"
  FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SupplierPayment"
  ADD CONSTRAINT "SupplierPayment_clinicId_fkey"
  FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StockLot"
  ADD CONSTRAINT "StockLot_clinicId_fkey"
  FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StockTransaction"
  ADD CONSTRAINT "StockTransaction_clinicId_fkey"
  FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PharmacyDispense"
  ADD CONSTRAINT "PharmacyDispense_clinicId_fkey"
  FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "Supplier_clinicId_idx"
  ON "Supplier"("clinicId");
CREATE INDEX IF NOT EXISTS "MedicationStock_clinicId_idx"
  ON "MedicationStock"("clinicId");
CREATE INDEX IF NOT EXISTS "StockMovement_clinicId_idx"
  ON "StockMovement"("clinicId");
CREATE INDEX IF NOT EXISTS "PurchaseOrder_clinicId_idx"
  ON "PurchaseOrder"("clinicId");
CREATE INDEX IF NOT EXISTS "GoodsReceipt_clinicId_idx"
  ON "GoodsReceipt"("clinicId");
CREATE INDEX IF NOT EXISTS "SupplierInvoice_clinicId_idx"
  ON "SupplierInvoice"("clinicId");
CREATE INDEX IF NOT EXISTS "SupplierPayment_clinicId_idx"
  ON "SupplierPayment"("clinicId");
CREATE INDEX IF NOT EXISTS "StockLot_clinicId_idx"
  ON "StockLot"("clinicId");
CREATE INDEX IF NOT EXISTS "StockTransaction_clinicId_idx"
  ON "StockTransaction"("clinicId");
CREATE INDEX IF NOT EXISTS "PharmacyDispense_clinicId_idx"
  ON "PharmacyDispense"("clinicId");
