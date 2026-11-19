-- CreateEnum
CREATE TYPE "PregnancyStatus" AS ENUM ('ONGOING', 'DELIVERED', 'ENDED');

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "motherPatientId" TEXT;

-- CreateTable
CREATE TABLE "Pregnancy" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "status" "PregnancyStatus" NOT NULL DEFAULT 'ONGOING',
    "lastMenstrualPeriod" TIMESTAMP(3),
    "expectedDeliveryDate" TIMESTAMP(3),
    "gravida" INTEGER,
    "parity" INTEGER,
    "riskLevel" TEXT,
    "riskFactors" TEXT,
    "bloodGroup" TEXT,
    "notes" TEXT,
    "outcome" TEXT,
    "endedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pregnancy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Pregnancy_clinicId_status_idx" ON "Pregnancy"("clinicId", "status");

-- CreateIndex
CREATE INDEX "Pregnancy_patientId_idx" ON "Pregnancy"("patientId");

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_motherPatientId_fkey" FOREIGN KEY ("motherPatientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pregnancy" ADD CONSTRAINT "Pregnancy_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pregnancy" ADD CONSTRAINT "Pregnancy_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Tenant isolation and audit trail.
ALTER TABLE "Pregnancy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Pregnancy" FORCE ROW LEVEL SECURITY;
CREATE POLICY "Pregnancy_tenant_isolation" ON "Pregnancy"
  USING ("aulia_tenant_visible"("clinicId")) WITH CHECK ("aulia_tenant_visible"("clinicId"));
CREATE TRIGGER "Pregnancy_audit_ledger" AFTER INSERT OR UPDATE OR DELETE ON "Pregnancy"
  FOR EACH ROW EXECUTE FUNCTION "audit_capture"();
