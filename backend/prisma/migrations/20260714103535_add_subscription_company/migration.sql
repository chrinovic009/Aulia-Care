-- CreateEnum
CREATE TYPE "SubscriptionCompanyStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "SubscriptionEmployeeStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "SubscriptionChargeStatus" AS ENUM ('PENDING_MONTHLY_INVOICE', 'INVOICED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MonthlySubscriptionInvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PAID', 'CANCELLED');

-- AlterEnum
ALTER TYPE "InvoiceType" ADD VALUE 'SUBSCRIPTION_MONTHLY';

-- CreateTable
CREATE TABLE "SubscriptionCompany" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "registrationNumber" TEXT,
    "taxNumber" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "contractNumber" TEXT,
    "status" "SubscriptionCompanyStatus" NOT NULL DEFAULT 'ACTIVE',
    "billingDay" INTEGER NOT NULL DEFAULT 30,
    "creditLimit" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SubscriptionCompany_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionEmployee" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "patientId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "middleName" TEXT,
    "gender" TEXT,
    "profession" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "age" INTEGER,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "nationality" TEXT,
    "policyNumber" TEXT NOT NULL,
    "employeeNumber" TEXT,
    "status" "SubscriptionEmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "firstAdmissionAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SubscriptionEmployee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionCharge" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT,
    "patientId" TEXT,
    "invoiceId" TEXT,
    "serviceId" TEXT,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "serviceDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "status" "SubscriptionChargeStatus" NOT NULL DEFAULT 'PENDING_MONTHLY_INVOICE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SubscriptionCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlySubscriptionInvoice" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "status" "MonthlySubscriptionInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MonthlySubscriptionInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionCompany_contractNumber_key" ON "SubscriptionCompany"("contractNumber");

-- CreateIndex
CREATE INDEX "SubscriptionCompany_name_idx" ON "SubscriptionCompany"("name");

-- CreateIndex
CREATE INDEX "SubscriptionCompany_status_idx" ON "SubscriptionCompany"("status");

-- CreateIndex
CREATE INDEX "SubscriptionEmployee_patientId_idx" ON "SubscriptionEmployee"("patientId");

-- CreateIndex
CREATE INDEX "SubscriptionEmployee_companyId_status_idx" ON "SubscriptionEmployee"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionEmployee_companyId_policyNumber_key" ON "SubscriptionEmployee"("companyId", "policyNumber");

-- CreateIndex
CREATE INDEX "SubscriptionCharge_companyId_year_month_idx" ON "SubscriptionCharge"("companyId", "year", "month");

-- CreateIndex
CREATE INDEX "SubscriptionCharge_patientId_idx" ON "SubscriptionCharge"("patientId");

-- CreateIndex
CREATE INDEX "SubscriptionCharge_status_idx" ON "SubscriptionCharge"("status");

-- CreateIndex
CREATE INDEX "MonthlySubscriptionInvoice_status_idx" ON "MonthlySubscriptionInvoice"("status");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlySubscriptionInvoice_companyId_year_month_key" ON "MonthlySubscriptionInvoice"("companyId", "year", "month");

-- AddForeignKey
ALTER TABLE "SubscriptionEmployee" ADD CONSTRAINT "SubscriptionEmployee_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "SubscriptionCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionEmployee" ADD CONSTRAINT "SubscriptionEmployee_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionCharge" ADD CONSTRAINT "SubscriptionCharge_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "SubscriptionCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionCharge" ADD CONSTRAINT "SubscriptionCharge_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "SubscriptionEmployee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionCharge" ADD CONSTRAINT "SubscriptionCharge_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionCharge" ADD CONSTRAINT "SubscriptionCharge_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionCharge" ADD CONSTRAINT "SubscriptionCharge_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlySubscriptionInvoice" ADD CONSTRAINT "MonthlySubscriptionInvoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "SubscriptionCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlySubscriptionInvoice" ADD CONSTRAINT "MonthlySubscriptionInvoice_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
