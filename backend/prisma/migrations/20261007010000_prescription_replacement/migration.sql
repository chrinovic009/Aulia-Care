CREATE TYPE "PrescriptionReplacementStatus" AS ENUM ('PENDING_FINANCE', 'APPROVED', 'REJECTED', 'COMPLETED');
CREATE TYPE "PrescriptionReplacementFinancialHandling" AS ENUM ('CANCEL_UNPAID', 'REFUND_REQUIRED', 'SUBSCRIPTION_REVERSE', 'SUBSCRIPTION_NEXT_PERIOD_ADJUSTMENT');

CREATE TABLE "PrescriptionReplacement" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "originalPrescriptionId" TEXT NOT NULL,
    "originalInvoiceId" TEXT NOT NULL,
    "replacementPrescriptionId" TEXT,
    "replacementInvoiceId" TEXT,
    "reason" TEXT NOT NULL,
    "requestedPayload" JSONB NOT NULL,
    "status" "PrescriptionReplacementStatus" NOT NULL DEFAULT 'PENDING_FINANCE',
    "financialHandling" "PrescriptionReplacementFinancialHandling" NOT NULL,
    "requestedById" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PrescriptionReplacement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PrescriptionReplacement_replacementPrescriptionId_key" ON "PrescriptionReplacement"("replacementPrescriptionId");
CREATE UNIQUE INDEX "PrescriptionReplacement_replacementInvoiceId_key" ON "PrescriptionReplacement"("replacementInvoiceId");
CREATE INDEX "PrescriptionReplacement_clinicId_status_requestedAt_idx" ON "PrescriptionReplacement"("clinicId", "status", "requestedAt");
CREATE INDEX "PrescriptionReplacement_originalPrescriptionId_idx" ON "PrescriptionReplacement"("originalPrescriptionId");
CREATE INDEX "PrescriptionReplacement_originalInvoiceId_idx" ON "PrescriptionReplacement"("originalInvoiceId");

ALTER TABLE "PrescriptionReplacement" ADD CONSTRAINT "PrescriptionReplacement_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PrescriptionReplacement" ADD CONSTRAINT "PrescriptionReplacement_originalPrescriptionId_fkey" FOREIGN KEY ("originalPrescriptionId") REFERENCES "Prescription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PrescriptionReplacement" ADD CONSTRAINT "PrescriptionReplacement_replacementPrescriptionId_fkey" FOREIGN KEY ("replacementPrescriptionId") REFERENCES "Prescription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PrescriptionReplacement" ADD CONSTRAINT "PrescriptionReplacement_originalInvoiceId_fkey" FOREIGN KEY ("originalInvoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PrescriptionReplacement" ADD CONSTRAINT "PrescriptionReplacement_replacementInvoiceId_fkey" FOREIGN KEY ("replacementInvoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PrescriptionReplacement" ADD CONSTRAINT "PrescriptionReplacement_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PrescriptionReplacement" ADD CONSTRAINT "PrescriptionReplacement_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
