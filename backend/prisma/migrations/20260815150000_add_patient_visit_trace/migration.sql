CREATE TYPE "PatientVisitStatus" AS ENUM (
  'REGISTERED',
  'AWAITING_PAYMENT',
  'ORIENTED',
  'IN_CONSULTATION',
  'COMPLETED',
  'CANCELLED'
);

CREATE TABLE "PatientVisit" (
  "id" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "receptionistId" TEXT,
  "clinicId" TEXT,
  "appointmentId" TEXT,
  "invoiceId" TEXT,
  "serviceId" TEXT,
  "visitType" TEXT NOT NULL,
  "reason" TEXT,
  "status" "PatientVisitStatus" NOT NULL DEFAULT 'REGISTERED',
  "arrivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "orientedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "cancellationReason" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PatientVisit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PatientVisit_appointmentId_key" ON "PatientVisit"("appointmentId");
CREATE UNIQUE INDEX "PatientVisit_invoiceId_key" ON "PatientVisit"("invoiceId");
CREATE INDEX "PatientVisit_patientId_arrivedAt_idx" ON "PatientVisit"("patientId", "arrivedAt");
CREATE INDEX "PatientVisit_receptionistId_arrivedAt_idx" ON "PatientVisit"("receptionistId", "arrivedAt");
CREATE INDEX "PatientVisit_clinicId_arrivedAt_idx" ON "PatientVisit"("clinicId", "arrivedAt");
CREATE INDEX "PatientVisit_status_arrivedAt_idx" ON "PatientVisit"("status", "arrivedAt");

ALTER TABLE "PatientVisit" ADD CONSTRAINT "PatientVisit_patientId_fkey"
  FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatientVisit" ADD CONSTRAINT "PatientVisit_receptionistId_fkey"
  FOREIGN KEY ("receptionistId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PatientVisit" ADD CONSTRAINT "PatientVisit_clinicId_fkey"
  FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PatientVisit" ADD CONSTRAINT "PatientVisit_appointmentId_fkey"
  FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PatientVisit" ADD CONSTRAINT "PatientVisit_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PatientVisit" ADD CONSTRAINT "PatientVisit_serviceId_fkey"
  FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Appointment" ADD COLUMN "statusReason" TEXT;
ALTER TABLE "Appointment" ADD COLUMN "cancelledAt" TIMESTAMP(3);
ALTER TABLE "Appointment" ADD COLUMN "cancelledById" TEXT;
