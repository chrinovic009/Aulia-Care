DO $$ BEGIN
  CREATE TYPE "WearableInventoryStatus" AS ENUM ('AVAILABLE', 'ASSIGNED', 'MAINTENANCE', 'LOST', 'REVOKED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "WearableSubscriptionStatus" AS ENUM ('PENDING_PAYMENT', 'ACTIVE', 'OVERDUE', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "WearablePlan" (
  "id" TEXT NOT NULL,
  "manufacturer" "WearableManufacturer" NOT NULL,
  "monthlyPrice" DECIMAL(12,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'CDF',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WearablePlan_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WearablePlan_manufacturer_key" UNIQUE ("manufacturer")
);

CREATE TABLE IF NOT EXISTS "WearableLot" (
  "id" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "manufacturer" "WearableManufacturer" NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "receivedById" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "planId" TEXT NOT NULL,
  CONSTRAINT "WearableLot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WearableLot_reference_key" UNIQUE ("reference"),
  CONSTRAINT "WearableLot_planId_fkey" FOREIGN KEY ("planId") REFERENCES "WearablePlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "WearableLot_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "WearableLot_manufacturer_receivedAt_idx" ON "WearableLot"("manufacturer", "receivedAt");

CREATE TABLE IF NOT EXISTS "WearableInventoryDevice" (
  "id" TEXT NOT NULL,
  "lotId" TEXT NOT NULL,
  "serialNumber" TEXT NOT NULL,
  "hardwareKeyId" TEXT NOT NULL,
  "platform" "WearablePlatform" NOT NULL,
  "status" "WearableInventoryStatus" NOT NULL DEFAULT 'AVAILABLE',
  "provisionedAt" TIMESTAMP(3),
  "assignedAt" TIMESTAMP(3),
  "returnedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WearableInventoryDevice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WearableInventoryDevice_serialNumber_key" UNIQUE ("serialNumber"),
  CONSTRAINT "WearableInventoryDevice_hardwareKeyId_key" UNIQUE ("hardwareKeyId"),
  CONSTRAINT "WearableInventoryDevice_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "WearableLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "WearableInventoryDevice_status_lotId_idx" ON "WearableInventoryDevice"("status", "lotId");

ALTER TABLE "WearableDevice" ADD COLUMN IF NOT EXISTS "inventoryDeviceId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "WearableDevice_inventoryDeviceId_key" ON "WearableDevice"("inventoryDeviceId");
DO $$ BEGIN
  ALTER TABLE "WearableDevice" ADD CONSTRAINT "WearableDevice_inventoryDeviceId_fkey" FOREIGN KEY ("inventoryDeviceId") REFERENCES "WearableInventoryDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "WearableSubscription" (
  "id" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "wearableDeviceId" TEXT NOT NULL,
  "inventoryDeviceId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "status" "WearableSubscriptionStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
  "amount" DECIMAL(12,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'CDF',
  "periodStartAt" TIMESTAMP(3) NOT NULL,
  "periodEndAt" TIMESTAMP(3) NOT NULL,
  "paidAt" TIMESTAMP(3),
  "invoiceId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WearableSubscription_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WearableSubscription_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WearableSubscription_wearableDeviceId_fkey" FOREIGN KEY ("wearableDeviceId") REFERENCES "WearableDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WearableSubscription_inventoryDeviceId_fkey" FOREIGN KEY ("inventoryDeviceId") REFERENCES "WearableInventoryDevice"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "WearableSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "WearablePlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "WearableSubscription_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "WearableSubscription_patientId_status_periodEndAt_idx" ON "WearableSubscription"("patientId", "status", "periodEndAt");
CREATE INDEX IF NOT EXISTS "WearableSubscription_wearableDeviceId_periodEndAt_idx" ON "WearableSubscription"("wearableDeviceId", "periodEndAt");
