/*
  Warnings:

  - Added the required column `clinicId` to the `ChatMessage` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "ChatMessage_recipientId_status_idx";

-- DropIndex
DROP INDEX "ChatMessage_senderId_recipientId_createdAt_idx";

-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN     "clinicId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "ChatMessage_clinicId_senderId_recipientId_createdAt_idx" ON "ChatMessage"("clinicId", "senderId", "recipientId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_clinicId_recipientId_status_idx" ON "ChatMessage"("clinicId", "recipientId", "status");

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
