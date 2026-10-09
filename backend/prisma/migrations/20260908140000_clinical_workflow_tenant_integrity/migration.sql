-- The clinical and financial workflow is tenant-bound.  This migration only
-- derives a tenant from a direct parent record; it never guesses a clinic.
-- Any inconsistent historical data aborts the migration and must be repaired
-- explicitly before deployment.

ALTER TABLE "Hospitalization" ADD COLUMN "clinicId" TEXT;
ALTER TABLE "ImagingRequest" ADD COLUMN "clinicId" TEXT;

UPDATE "PatientVisit" AS child
SET "clinicId" = parent."clinicId"
FROM "Patient" AS parent
WHERE child."patientId" = parent.id
  AND child."clinicId" IS NULL
  AND parent."clinicId" IS NOT NULL;

UPDATE "Appointment" AS child
SET "clinicId" = parent."clinicId"
FROM "Patient" AS parent
WHERE child."patientId" = parent.id
  AND child."clinicId" IS NULL
  AND parent."clinicId" IS NOT NULL;

UPDATE "Consultation" AS child
SET "clinicId" = parent."clinicId"
FROM "Patient" AS parent
WHERE child."patientId" = parent.id
  AND child."clinicId" IS NULL
  AND parent."clinicId" IS NOT NULL;

UPDATE "Prescription" AS child
SET "clinicId" = parent."clinicId"
FROM "Patient" AS parent
WHERE child."patientId" = parent.id
  AND child."clinicId" IS NULL
  AND parent."clinicId" IS NOT NULL;

UPDATE "LabRequest" AS child
SET "clinicId" = parent."clinicId"
FROM "Patient" AS parent
WHERE child."patientId" = parent.id
  AND child."clinicId" IS NULL
  AND parent."clinicId" IS NOT NULL;

UPDATE "ImagingRequest" AS child
SET "clinicId" = parent."clinicId"
FROM "Patient" AS parent
WHERE child."patientId" = parent.id
  AND parent."clinicId" IS NOT NULL;

UPDATE "Hospitalization" AS child
SET "clinicId" = parent."clinicId"
FROM "Patient" AS parent
WHERE child."patientId" = parent.id
  AND parent."clinicId" IS NOT NULL;

UPDATE "Invoice" AS child
SET "clinicId" = parent."clinicId"
FROM "Patient" AS parent
WHERE child."patientId" = parent.id
  AND child."clinicId" IS NULL
  AND parent."clinicId" IS NOT NULL;

UPDATE "Payment" AS child
SET "clinicId" = invoice."clinicId"
FROM "Invoice" AS invoice
WHERE child."invoiceId" = invoice.id
  AND child."clinicId" IS NULL
  AND invoice."clinicId" IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Patient" WHERE "clinicId" IS NULL) THEN
    RAISE EXCEPTION 'Tenant migration blocked: Patient without clinicId';
  END IF;
  IF EXISTS (SELECT 1 FROM "PatientVisit" WHERE "clinicId" IS NULL) THEN
    RAISE EXCEPTION 'Tenant migration blocked: PatientVisit without clinicId';
  END IF;
  IF EXISTS (SELECT 1 FROM "Appointment" WHERE "clinicId" IS NULL) THEN
    RAISE EXCEPTION 'Tenant migration blocked: Appointment without clinicId';
  END IF;
  IF EXISTS (SELECT 1 FROM "Consultation" WHERE "clinicId" IS NULL) THEN
    RAISE EXCEPTION 'Tenant migration blocked: Consultation without clinicId';
  END IF;
  IF EXISTS (SELECT 1 FROM "Prescription" WHERE "clinicId" IS NULL) THEN
    RAISE EXCEPTION 'Tenant migration blocked: Prescription without clinicId';
  END IF;
  IF EXISTS (SELECT 1 FROM "LabRequest" WHERE "clinicId" IS NULL) THEN
    RAISE EXCEPTION 'Tenant migration blocked: LabRequest without clinicId';
  END IF;
  IF EXISTS (SELECT 1 FROM "ImagingRequest" WHERE "clinicId" IS NULL) THEN
    RAISE EXCEPTION 'Tenant migration blocked: ImagingRequest without clinicId';
  END IF;
  IF EXISTS (SELECT 1 FROM "Hospitalization" WHERE "clinicId" IS NULL) THEN
    RAISE EXCEPTION 'Tenant migration blocked: Hospitalization without clinicId';
  END IF;
  IF EXISTS (SELECT 1 FROM "Invoice" WHERE "clinicId" IS NULL) THEN
    RAISE EXCEPTION 'Tenant migration blocked: Invoice without clinicId';
  END IF;
  IF EXISTS (SELECT 1 FROM "Payment" WHERE "clinicId" IS NULL) THEN
    RAISE EXCEPTION 'Tenant migration blocked: Payment without clinicId';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "PatientVisit" child JOIN "Patient" parent ON parent.id = child."patientId"
    WHERE child."clinicId" IS DISTINCT FROM parent."clinicId"
  ) THEN RAISE EXCEPTION 'Tenant migration blocked: PatientVisit clinic mismatch'; END IF;
  IF EXISTS (
    SELECT 1 FROM "Appointment" child JOIN "Patient" parent ON parent.id = child."patientId"
    WHERE child."clinicId" IS DISTINCT FROM parent."clinicId"
  ) THEN RAISE EXCEPTION 'Tenant migration blocked: Appointment clinic mismatch'; END IF;
  IF EXISTS (
    SELECT 1 FROM "Consultation" child JOIN "Patient" parent ON parent.id = child."patientId"
    WHERE child."clinicId" IS DISTINCT FROM parent."clinicId"
  ) THEN RAISE EXCEPTION 'Tenant migration blocked: Consultation clinic mismatch'; END IF;
  IF EXISTS (
    SELECT 1 FROM "Prescription" child JOIN "Patient" parent ON parent.id = child."patientId"
    WHERE child."clinicId" IS DISTINCT FROM parent."clinicId"
  ) THEN RAISE EXCEPTION 'Tenant migration blocked: Prescription clinic mismatch'; END IF;
  IF EXISTS (
    SELECT 1 FROM "LabRequest" child JOIN "Patient" parent ON parent.id = child."patientId"
    WHERE child."clinicId" IS DISTINCT FROM parent."clinicId"
  ) THEN RAISE EXCEPTION 'Tenant migration blocked: LabRequest clinic mismatch'; END IF;
  IF EXISTS (
    SELECT 1 FROM "ImagingRequest" child JOIN "Patient" parent ON parent.id = child."patientId"
    WHERE child."clinicId" IS DISTINCT FROM parent."clinicId"
  ) THEN RAISE EXCEPTION 'Tenant migration blocked: ImagingRequest clinic mismatch'; END IF;
  IF EXISTS (
    SELECT 1 FROM "Hospitalization" child JOIN "Patient" parent ON parent.id = child."patientId"
    WHERE child."clinicId" IS DISTINCT FROM parent."clinicId"
  ) THEN RAISE EXCEPTION 'Tenant migration blocked: Hospitalization clinic mismatch'; END IF;
  IF EXISTS (
    SELECT 1 FROM "Invoice" child JOIN "Patient" parent ON parent.id = child."patientId"
    WHERE child."clinicId" IS DISTINCT FROM parent."clinicId"
  ) THEN RAISE EXCEPTION 'Tenant migration blocked: Invoice clinic mismatch'; END IF;
  IF EXISTS (
    SELECT 1 FROM "Payment" child JOIN "Invoice" parent ON parent.id = child."invoiceId"
    WHERE child."clinicId" IS DISTINCT FROM parent."clinicId"
  ) THEN RAISE EXCEPTION 'Tenant migration blocked: Payment clinic mismatch'; END IF;
END $$;

ALTER TABLE "Patient" ALTER COLUMN "clinicId" SET NOT NULL;
ALTER TABLE "PatientVisit" ALTER COLUMN "clinicId" SET NOT NULL;
ALTER TABLE "Appointment" ALTER COLUMN "clinicId" SET NOT NULL;
ALTER TABLE "Consultation" ALTER COLUMN "clinicId" SET NOT NULL;
ALTER TABLE "Prescription" ALTER COLUMN "clinicId" SET NOT NULL;
ALTER TABLE "LabRequest" ALTER COLUMN "clinicId" SET NOT NULL;
ALTER TABLE "ImagingRequest" ALTER COLUMN "clinicId" SET NOT NULL;
ALTER TABLE "Hospitalization" ALTER COLUMN "clinicId" SET NOT NULL;
ALTER TABLE "Invoice" ALTER COLUMN "clinicId" SET NOT NULL;
ALTER TABLE "Payment" ALTER COLUMN "clinicId" SET NOT NULL;

ALTER TABLE "Patient" DROP CONSTRAINT IF EXISTS "Patient_clinicId_fkey";
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_clinicId_fkey"
  FOREIGN KEY ("clinicId") REFERENCES "Clinic"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PatientVisit" DROP CONSTRAINT IF EXISTS "PatientVisit_clinicId_fkey";
ALTER TABLE "PatientVisit" ADD CONSTRAINT "PatientVisit_clinicId_fkey"
  FOREIGN KEY ("clinicId") REFERENCES "Clinic"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" DROP CONSTRAINT IF EXISTS "Invoice_clinicId_fkey";
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_clinicId_fkey"
  FOREIGN KEY ("clinicId") REFERENCES "Clinic"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" DROP CONSTRAINT IF EXISTS "Payment_clinicId_fkey";
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_clinicId_fkey"
  FOREIGN KEY ("clinicId") REFERENCES "Clinic"(id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_clinicId_fkey"
  FOREIGN KEY ("clinicId") REFERENCES "Clinic"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_clinicId_fkey"
  FOREIGN KEY ("clinicId") REFERENCES "Clinic"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_clinicId_fkey"
  FOREIGN KEY ("clinicId") REFERENCES "Clinic"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LabRequest" ADD CONSTRAINT "LabRequest_clinicId_fkey"
  FOREIGN KEY ("clinicId") REFERENCES "Clinic"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ImagingRequest" ADD CONSTRAINT "ImagingRequest_clinicId_fkey"
  FOREIGN KEY ("clinicId") REFERENCES "Clinic"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Hospitalization" ADD CONSTRAINT "Hospitalization_clinicId_fkey"
  FOREIGN KEY ("clinicId") REFERENCES "Clinic"(id) ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Hospitalization_clinicId_status_idx" ON "Hospitalization"("clinicId", status);
CREATE INDEX "ImagingRequest_clinicId_status_idx" ON "ImagingRequest"("clinicId", status);
