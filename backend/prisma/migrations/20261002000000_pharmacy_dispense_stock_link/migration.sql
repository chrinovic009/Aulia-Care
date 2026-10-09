ALTER TABLE "StockTransaction" ADD COLUMN "pharmacyDispenseId" TEXT;

CREATE INDEX "StockTransaction_pharmacyDispenseId_idx" ON "StockTransaction"("pharmacyDispenseId");

ALTER TABLE "StockTransaction" ADD CONSTRAINT "StockTransaction_pharmacyDispenseId_fkey"
  FOREIGN KEY ("pharmacyDispenseId") REFERENCES "PharmacyDispense"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
