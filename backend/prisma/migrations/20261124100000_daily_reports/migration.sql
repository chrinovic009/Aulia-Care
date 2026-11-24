-- Daily reports of every service, generated each night and archived.

-- CreateTable
CREATE TABLE "DailyReport" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyReport_clinicId_day_idx" ON "DailyReport"("clinicId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "DailyReport_clinicId_service_day_key" ON "DailyReport"("clinicId", "service", "day");

-- AddForeignKey
ALTER TABLE "DailyReport" ADD CONSTRAINT "DailyReport_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Establishment isolation: staff of the establishment only, never a patient-portal session.
ALTER TABLE "DailyReport" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DailyReport" FORCE ROW LEVEL SECURITY;
CREATE POLICY "DailyReport_tenant_isolation" ON "DailyReport"
  USING (coalesce(current_setting('app.user_role', true), '') <> 'PATIENT' AND "aulia_clinic_reference_visible"("clinicId"))
  WITH CHECK (coalesce(current_setting('app.user_role', true), '') <> 'PATIENT' AND "aulia_clinic_reference_visible"("clinicId"));
GRANT SELECT, INSERT, UPDATE, DELETE ON "DailyReport" TO aulia_app;
