-- CreateEnum
CREATE TYPE "DrugInteractionSeverity" AS ENUM ('MINOR', 'MODERATE', 'MAJOR', 'CONTRAINDICATED');

-- CreateEnum
CREATE TYPE "DrugInteractionRuleStatus" AS ENUM ('PROPOSED', 'ACTIVE', 'RETIRED');

-- AlterTable
ALTER TABLE "Medication" ADD COLUMN     "activeSubstance" TEXT,
ADD COLUMN     "atcCode" TEXT;

-- CreateTable
CREATE TABLE "DrugInteractionRule" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "substanceA" TEXT NOT NULL,
    "substanceB" TEXT NOT NULL,
    "severity" "DrugInteractionSeverity" NOT NULL,
    "effect" TEXT NOT NULL,
    "recommendation" TEXT,
    "source" TEXT NOT NULL,
    "status" "DrugInteractionRuleStatus" NOT NULL DEFAULT 'PROPOSED',
    "statusReason" TEXT,
    "proposedById" TEXT NOT NULL,
    "validatedById" TEXT,
    "validatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DrugInteractionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrescriptionSafetyOverride" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "prescriptionId" TEXT NOT NULL,
    "prescriberId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "blocking" BOOLEAN NOT NULL,
    "severity" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "detail" JSONB,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrescriptionSafetyOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DrugInteractionRule_clinicId_status_idx" ON "DrugInteractionRule"("clinicId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DrugInteractionRule_clinicId_substanceA_substanceB_key" ON "DrugInteractionRule"("clinicId", "substanceA", "substanceB");

-- CreateIndex
CREATE INDEX "PrescriptionSafetyOverride_prescriptionId_idx" ON "PrescriptionSafetyOverride"("prescriptionId");

-- CreateIndex
CREATE INDEX "PrescriptionSafetyOverride_clinicId_createdAt_idx" ON "PrescriptionSafetyOverride"("clinicId", "createdAt");

-- AddForeignKey
ALTER TABLE "DrugInteractionRule" ADD CONSTRAINT "DrugInteractionRule_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrugInteractionRule" ADD CONSTRAINT "DrugInteractionRule_proposedById_fkey" FOREIGN KEY ("proposedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrugInteractionRule" ADD CONSTRAINT "DrugInteractionRule_validatedById_fkey" FOREIGN KEY ("validatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionSafetyOverride" ADD CONSTRAINT "PrescriptionSafetyOverride_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionSafetyOverride" ADD CONSTRAINT "PrescriptionSafetyOverride_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionSafetyOverride" ADD CONSTRAINT "PrescriptionSafetyOverride_prescriberId_fkey" FOREIGN KEY ("prescriberId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Tenant isolation and audit for the new safety tables; catalogue changes
-- (DCI / ATC filled in by the pharmacy) are audited too.
ALTER TABLE "DrugInteractionRule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DrugInteractionRule" FORCE ROW LEVEL SECURITY;
CREATE POLICY "DrugInteractionRule_tenant_isolation" ON "DrugInteractionRule"
  USING ("aulia_tenant_visible"("clinicId")) WITH CHECK ("aulia_tenant_visible"("clinicId"));
ALTER TABLE "PrescriptionSafetyOverride" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PrescriptionSafetyOverride" FORCE ROW LEVEL SECURITY;
CREATE POLICY "PrescriptionSafetyOverride_tenant_isolation" ON "PrescriptionSafetyOverride"
  USING ("aulia_tenant_visible"("clinicId")) WITH CHECK ("aulia_tenant_visible"("clinicId"));

CREATE TRIGGER "DrugInteractionRule_audit_ledger" AFTER INSERT OR UPDATE OR DELETE ON "DrugInteractionRule"
  FOR EACH ROW EXECUTE FUNCTION "audit_capture"();
CREATE TRIGGER "PrescriptionSafetyOverride_audit_ledger" AFTER INSERT OR UPDATE OR DELETE ON "PrescriptionSafetyOverride"
  FOR EACH ROW EXECUTE FUNCTION "audit_capture"();
CREATE TRIGGER "Medication_audit_ledger" AFTER INSERT OR UPDATE OR DELETE ON "Medication"
  FOR EACH ROW EXECUTE FUNCTION "audit_capture"();
