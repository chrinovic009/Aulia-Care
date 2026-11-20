CREATE TYPE "MessageKind" AS ENUM ('TEXT', 'VOICE', 'PHOTO', 'IMAGING');

ALTER TABLE "ChatMessage"
ADD COLUMN "kind" "MessageKind" NOT NULL DEFAULT 'TEXT',
ADD COLUMN "attachmentStorageKey" TEXT,
ADD COLUMN "attachmentOriginalName" TEXT,
ADD COLUMN "attachmentMimeType" TEXT,
ADD COLUMN "attachmentSizeBytes" INTEGER,
ADD COLUMN "audioDurationMs" INTEGER,
ADD COLUMN "imagingRequestId" TEXT,
ADD COLUMN "patientShareAuthorizedById" TEXT,
ADD COLUMN "patientShareAuthorizedAt" TIMESTAMP(3);

CREATE INDEX "ChatMessage_clinicId_imagingRequestId_idx" ON "ChatMessage"("clinicId", "imagingRequestId");

ALTER TABLE "ChatMessage"
ADD CONSTRAINT "ChatMessage_media_shape" CHECK (
  ("kind" = 'TEXT' AND "attachmentStorageKey" IS NULL AND "imagingRequestId" IS NULL)
  OR ("kind" IN ('VOICE', 'PHOTO') AND "attachmentStorageKey" IS NOT NULL AND "attachmentMimeType" IS NOT NULL AND "attachmentSizeBytes" > 0 AND "imagingRequestId" IS NULL)
  OR ("kind" = 'IMAGING' AND "attachmentStorageKey" IS NULL AND "imagingRequestId" IS NOT NULL)
);

ALTER TABLE "ChatMessage"
ADD CONSTRAINT "ChatMessage_patient_share_shape" CHECK (
  ("patientShareAuthorizedById" IS NULL AND "patientShareAuthorizedAt" IS NULL)
  OR ("kind" = 'IMAGING' AND "patientShareAuthorizedById" IS NOT NULL AND "patientShareAuthorizedAt" IS NOT NULL)
);
