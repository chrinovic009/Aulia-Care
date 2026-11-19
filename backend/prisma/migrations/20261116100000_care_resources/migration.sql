-- CreateEnum
CREATE TYPE "CareResourceKind" AS ENUM ('VEHICLE', 'TEAM', 'EQUIPMENT', 'ROOM', 'MACHINE');

-- CreateEnum
CREATE TYPE "CareResourceStatus" AS ENUM ('AVAILABLE', 'ENGAGED', 'UNAVAILABLE', 'MAINTENANCE', 'RETIRED');

-- CreateTable
CREATE TABLE "CareResource" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "careUnitId" TEXT NOT NULL,
    "kind" "CareResourceKind" NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" "CareResourceStatus" NOT NULL DEFAULT 'AVAILABLE',
    "statusReason" TEXT,
    "assignedEpisodeId" TEXT,
    "details" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CareResource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CareResource_clinicId_careUnitId_kind_status_idx" ON "CareResource"("clinicId", "careUnitId", "kind", "status");

-- CreateIndex
CREATE INDEX "CareResource_assignedEpisodeId_idx" ON "CareResource"("assignedEpisodeId");

-- CreateIndex
CREATE UNIQUE INDEX "CareResource_careUnitId_code_key" ON "CareResource"("careUnitId", "code");

-- AddForeignKey
ALTER TABLE "CareResource" ADD CONSTRAINT "CareResource_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareResource" ADD CONSTRAINT "CareResource_careUnitId_fkey" FOREIGN KEY ("careUnitId") REFERENCES "CareUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareResource" ADD CONSTRAINT "CareResource_assignedEpisodeId_fkey" FOREIGN KEY ("assignedEpisodeId") REFERENCES "CareEpisode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Tenant isolation and audit trail, like every other Care Workflow table.
ALTER TABLE "CareResource" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CareResource" FORCE ROW LEVEL SECURITY;
CREATE POLICY "CareResource_tenant_isolation" ON "CareResource"
  USING ("aulia_tenant_visible"("clinicId")) WITH CHECK ("aulia_tenant_visible"("clinicId"));
CREATE TRIGGER "CareResource_audit_ledger" AFTER INSERT OR UPDATE OR DELETE ON "CareResource"
  FOR EACH ROW EXECUTE FUNCTION "audit_capture"();
