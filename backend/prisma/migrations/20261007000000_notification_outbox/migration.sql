CREATE TYPE "NotificationOutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'DELIVERED', 'FAILED');

CREATE TABLE "NotificationOutbox" (
  "id" TEXT NOT NULL,
  "clinicId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "deduplicationKey" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "NotificationOutboxStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationOutbox_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Notification" ADD COLUMN "outboxEventId" TEXT;

CREATE UNIQUE INDEX "Notification_outboxEventId_recipientId_key" ON "Notification"("outboxEventId", "recipientId");
CREATE UNIQUE INDEX "NotificationOutbox_deduplicationKey_key" ON "NotificationOutbox"("deduplicationKey");
CREATE INDEX "NotificationOutbox_status_availableAt_idx" ON "NotificationOutbox"("status", "availableAt");
CREATE INDEX "NotificationOutbox_clinicId_createdAt_idx" ON "NotificationOutbox"("clinicId", "createdAt");

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_outboxEventId_fkey"
  FOREIGN KEY ("outboxEventId") REFERENCES "NotificationOutbox"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "NotificationOutbox" ADD CONSTRAINT "NotificationOutbox_clinicId_fkey"
  FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
