/*
  Warnings:

  - A unique constraint covering the columns `[dicomStudyInstanceUid]` on the table `ImagingReport` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "ImagingReport_dicomStudyInstanceUid_key" ON "ImagingReport"("dicomStudyInstanceUid");

-- CreateIndex
CREATE INDEX "ImagingReport_imagingRequestId_idx" ON "ImagingReport"("imagingRequestId");

-- CreateIndex
CREATE INDEX "ImagingRequest_consultationId_idx" ON "ImagingRequest"("consultationId");

-- CreateIndex
CREATE INDEX "ImagingRequest_patientId_idx" ON "ImagingRequest"("patientId");

-- CreateIndex
CREATE INDEX "ImagingRequest_requestedById_idx" ON "ImagingRequest"("requestedById");
