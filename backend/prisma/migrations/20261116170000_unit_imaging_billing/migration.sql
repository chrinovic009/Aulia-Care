-- An imaging exam requested by a care unit has no consultation: it is linked
-- to the care-workflow request, goes through the imaging module and is billed
-- like any other imaging exam.
ALTER TABLE "ImagingRequest" ALTER COLUMN "consultationId" DROP NOT NULL;
ALTER TABLE "ImagingRequest" ADD COLUMN "serviceRequestId" TEXT;
CREATE UNIQUE INDEX "ImagingRequest_serviceRequestId_key" ON "ImagingRequest"("serviceRequestId");
ALTER TABLE "ImagingRequest" ADD CONSTRAINT "ImagingRequest_serviceRequestId_fkey"
  FOREIGN KEY ("serviceRequestId") REFERENCES "ServiceRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
