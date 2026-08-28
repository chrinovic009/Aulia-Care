-- Additive tenant-provisioning migration.  Existing records remain untouched
-- until the explicit tenant-integrity repair tool is run by an operator.
CREATE TYPE "EstablishmentType" AS ENUM (
  'HOSPITAL', 'CLINIC', 'POLYCLINIC', 'MEDICAL_CENTER',
  'DIAGNOSTIC_CENTER', 'HEALTH_CENTER', 'OTHER'
);

CREATE TYPE "ClinicProvisioningStatus" AS ENUM (
  'DRAFT', 'IDENTITY_CONFIGURED', 'LAYERS_CONFIGURED',
  'SUPER_ADMIN_CREATED', 'ACTIVE'
);

ALTER TABLE "Clinic"
  ADD COLUMN "establishmentType" "EstablishmentType" NOT NULL DEFAULT 'CLINIC',
  ADD COLUMN "provisioningStatus" "ClinicProvisioningStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "website" TEXT,
  ADD COLUMN "province" TEXT,
  ADD COLUMN "neighborhood" TEXT,
  ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'CDF';

ALTER TABLE "PlatformLayerConfiguration" ADD COLUMN "clinicId" TEXT;

CREATE UNIQUE INDEX "PlatformLayerConfiguration_clinicId_key"
  ON "PlatformLayerConfiguration"("clinicId");

ALTER TABLE "PlatformLayerConfiguration"
  ADD CONSTRAINT "PlatformLayerConfiguration_clinicId_fkey"
  FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
