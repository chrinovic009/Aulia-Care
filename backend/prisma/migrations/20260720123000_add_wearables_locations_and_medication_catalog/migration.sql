-- Pharmacy catalogue: Section -> Category -> Medication
CREATE TABLE "MedicationSection" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MedicationSection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MedicationCategory" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MedicationCategory_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Medication" ADD COLUMN "categoryId" TEXT;

CREATE TYPE "DiscountRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
CREATE TABLE "InvoiceDiscountRequest" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "DiscountRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    CONSTRAINT "InvoiceDiscountRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "InvoiceDiscountRequest_invoiceId_status_idx" ON "InvoiceDiscountRequest"("invoiceId", "status");
CREATE INDEX "InvoiceDiscountRequest_status_requestedAt_idx" ON "InvoiceDiscountRequest"("status", "requestedAt");
ALTER TABLE "InvoiceDiscountRequest" ADD CONSTRAINT "InvoiceDiscountRequest_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InvoiceDiscountRequest" ADD CONSTRAINT "InvoiceDiscountRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvoiceDiscountRequest" ADD CONSTRAINT "InvoiceDiscountRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Autonomous watch registry and high-volume telemetry.
CREATE TYPE "WearableManufacturer" AS ENUM ('APPLE', 'SAMSUNG', 'OTHER');
CREATE TYPE "WearablePlatform" AS ENUM ('WATCHOS', 'WEAR_OS', 'OTHER');
CREATE TYPE "WearableStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'REVOKED');
CREATE TYPE "WearableMetric" AS ENUM ('HEART_RATE_BPM', 'BLOOD_PRESSURE_SYSTOLIC_MMHG', 'BLOOD_PRESSURE_DIASTOLIC_MMHG', 'BLOOD_GLUCOSE_MG_DL', 'SPO2_PERCENT', 'WEIGHT_KG', 'BODY_FAT_PERCENT');
CREATE TYPE "MeasurementQuality" AS ENUM ('GOOD', 'SUSPECT', 'INVALID', 'UNKNOWN');
CREATE TYPE "LocationSource" AS ENUM ('WATCH_GPS', 'MOBILE_GPS', 'MANUAL');
CREATE TYPE "EmergencyLocationReason" AS ENUM ('CRITICAL_VITAL_ALERT', 'PARENT_IMMEDIATE_LOCATION', 'CLINICAL_EMERGENCY');
CREATE TYPE "EmergencyLocationRequestStatus" AS ENUM ('PENDING', 'DISPATCHED', 'FULFILLED', 'EXPIRED', 'CANCELLED', 'FAILED');
CREATE TYPE "ParentChildLinkStatus" AS ENUM ('PENDING', 'ACTIVE', 'REVOKED', 'EXPIRED');

CREATE TABLE "WearableDevice" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "manufacturer" "WearableManufacturer" NOT NULL,
    "platform" "WearablePlatform" NOT NULL,
    "externalDeviceId" TEXT NOT NULL,
    "displayName" TEXT,
    "esimPhoneNumber" TEXT,
    "status" "WearableStatus" NOT NULL DEFAULT 'ACTIVE',
    "pairedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3),
    "lastLocationAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "WearableDevice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WearableMeasurement" (
    "id" TEXT NOT NULL,
    "wearableDeviceId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "metric" "WearableMetric" NOT NULL,
    "value" DECIMAL(12,4) NOT NULL,
    "unit" TEXT NOT NULL,
    "measuredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceSequence" TEXT NOT NULL DEFAULT '',
    "quality" "MeasurementQuality" NOT NULL DEFAULT 'UNKNOWN',
    "metadata" JSONB,
    CONSTRAINT "WearableMeasurement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmergencyLocationRequest" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "wearableDeviceId" TEXT,
    "requestedById" TEXT,
    "reason" "EmergencyLocationReason" NOT NULL,
    "status" "EmergencyLocationRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "fulfilledAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EmergencyLocationRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmergencyLocation" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "wearableDeviceId" TEXT,
    "requestId" TEXT,
    "latitude" DECIMAL(9,6) NOT NULL,
    "longitude" DECIMAL(9,6) NOT NULL,
    "accuracyMeters" DECIMAL(10,2),
    "altitudeMeters" DECIMAL(10,2),
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" "LocationSource" NOT NULL,
    CONSTRAINT "EmergencyLocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ParentChildLink" (
    "id" TEXT NOT NULL,
    "parentUserId" TEXT NOT NULL,
    "childPatientId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "ParentChildLinkStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ParentChildLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MedicationSection_code_key" ON "MedicationSection"("code");
CREATE UNIQUE INDEX "MedicationCategory_sectionId_code_key" ON "MedicationCategory"("sectionId", "code");
CREATE UNIQUE INDEX "MedicationCategory_sectionId_name_key" ON "MedicationCategory"("sectionId", "name");
CREATE INDEX "MedicationSection_active_sortOrder_idx" ON "MedicationSection"("active", "sortOrder");
CREATE INDEX "MedicationCategory_sectionId_active_sortOrder_idx" ON "MedicationCategory"("sectionId", "active", "sortOrder");
CREATE INDEX "Medication_categoryId_idx" ON "Medication"("categoryId");
CREATE UNIQUE INDEX "WearableDevice_externalDeviceId_key" ON "WearableDevice"("externalDeviceId");
CREATE INDEX "WearableDevice_patientId_status_idx" ON "WearableDevice"("patientId", "status");
CREATE INDEX "WearableDevice_lastSeenAt_idx" ON "WearableDevice"("lastSeenAt");
CREATE UNIQUE INDEX "WearableMeasurement_wearableDeviceId_metric_measuredAt_sourceSequence_key" ON "WearableMeasurement"("wearableDeviceId", "metric", "measuredAt", "sourceSequence");
CREATE INDEX "WearableMeasurement_patientId_metric_measuredAt_idx" ON "WearableMeasurement"("patientId", "metric", "measuredAt");
CREATE INDEX "WearableMeasurement_wearableDeviceId_measuredAt_idx" ON "WearableMeasurement"("wearableDeviceId", "measuredAt");
CREATE INDEX "WearableMeasurement_measuredAt_idx" ON "WearableMeasurement"("measuredAt");
CREATE INDEX "EmergencyLocationRequest_wearableDeviceId_status_idx" ON "EmergencyLocationRequest"("wearableDeviceId", "status");
CREATE INDEX "EmergencyLocationRequest_status_expiresAt_idx" ON "EmergencyLocationRequest"("status", "expiresAt");
CREATE INDEX "EmergencyLocation_patientId_capturedAt_idx" ON "EmergencyLocation"("patientId", "capturedAt");
CREATE INDEX "EmergencyLocation_wearableDeviceId_capturedAt_idx" ON "EmergencyLocation"("wearableDeviceId", "capturedAt");
CREATE INDEX "EmergencyLocation_requestId_idx" ON "EmergencyLocation"("requestId");
CREATE UNIQUE INDEX "ParentChildLink_tokenHash_key" ON "ParentChildLink"("tokenHash");
CREATE UNIQUE INDEX "ParentChildLink_parentUserId_childPatientId_key" ON "ParentChildLink"("parentUserId", "childPatientId");
CREATE INDEX "ParentChildLink_childPatientId_status_idx" ON "ParentChildLink"("childPatientId", "status");
CREATE INDEX "ParentChildLink_status_expiresAt_idx" ON "ParentChildLink"("status", "expiresAt");

ALTER TABLE "MedicationCategory" ADD CONSTRAINT "MedicationCategory_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "MedicationSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Medication" ADD CONSTRAINT "Medication_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "MedicationCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WearableDevice" ADD CONSTRAINT "WearableDevice_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WearableMeasurement" ADD CONSTRAINT "WearableMeasurement_wearableDeviceId_fkey" FOREIGN KEY ("wearableDeviceId") REFERENCES "WearableDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WearableMeasurement" ADD CONSTRAINT "WearableMeasurement_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmergencyLocationRequest" ADD CONSTRAINT "EmergencyLocationRequest_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmergencyLocationRequest" ADD CONSTRAINT "EmergencyLocationRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmergencyLocationRequest" ADD CONSTRAINT "EmergencyLocationRequest_wearableDeviceId_fkey" FOREIGN KEY ("wearableDeviceId") REFERENCES "WearableDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmergencyLocation" ADD CONSTRAINT "EmergencyLocation_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmergencyLocation" ADD CONSTRAINT "EmergencyLocation_wearableDeviceId_fkey" FOREIGN KEY ("wearableDeviceId") REFERENCES "WearableDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmergencyLocation" ADD CONSTRAINT "EmergencyLocation_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "EmergencyLocationRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ParentChildLink" ADD CONSTRAINT "ParentChildLink_parentUserId_fkey" FOREIGN KEY ("parentUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ParentChildLink" ADD CONSTRAINT "ParentChildLink_childPatientId_fkey" FOREIGN KEY ("childPatientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
