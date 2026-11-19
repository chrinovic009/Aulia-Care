CREATE TABLE "MedicationSalePrice" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "medicationId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CDF',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedicationSalePrice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MedicationSalePrice_clinicId_medicationId_key" ON "MedicationSalePrice"("clinicId", "medicationId");
CREATE INDEX "MedicationSalePrice_medicationId_idx" ON "MedicationSalePrice"("medicationId");

ALTER TABLE "MedicationSalePrice" ADD CONSTRAINT "MedicationSalePrice_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MedicationSalePrice" ADD CONSTRAINT "MedicationSalePrice_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "Medication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MedicationSalePrice" ADD CONSTRAINT "MedicationSalePrice_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "MedicationSalePrice" ADD CONSTRAINT "MedicationSalePrice_currency_cdf" CHECK ("currency" = 'CDF');
