-- CreateEnum
CREATE TYPE "InvoiceType" AS ENUM ('ADMISSION_FEE', 'SERVICE', 'PHARMACY', 'LABORATORY', 'RADIOLOGY', 'SURGERY', 'OTHER');

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "type" "InvoiceType" NOT NULL DEFAULT 'ADMISSION_FEE';

-- CreateTable
CREATE TABLE "AdmissionFee" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Frais de fiche d''admission',
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CDF',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdmissionFee_pkey" PRIMARY KEY ("id")
);
