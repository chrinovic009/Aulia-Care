-- A laboratory exam requested by a care unit (emergency, maternity...) has no
-- consultation: it is linked to the care-workflow request instead, so it goes
-- through the laboratory module and is billed like any other exam.
ALTER TABLE "LabRequest" ALTER COLUMN "consultationId" DROP NOT NULL;
ALTER TABLE "LabRequest" ADD COLUMN "serviceRequestId" TEXT;
CREATE UNIQUE INDEX "LabRequest_serviceRequestId_key" ON "LabRequest"("serviceRequestId");
ALTER TABLE "LabRequest" ADD CONSTRAINT "LabRequest_serviceRequestId_fkey"
  FOREIGN KEY ("serviceRequestId") REFERENCES "ServiceRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
