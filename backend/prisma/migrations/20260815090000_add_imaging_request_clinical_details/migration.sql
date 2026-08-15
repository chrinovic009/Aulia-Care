-- Clinical request details used by the radiology workflow. Additive and safe for
-- existing records: historical imaging requests simply retain NULL values.
ALTER TABLE "ImagingRequest" ADD COLUMN IF NOT EXISTS "examSubType" TEXT;
ALTER TABLE "ImagingRequest" ADD COLUMN IF NOT EXISTS "laterality" TEXT;
ALTER TABLE "ImagingRequest" ADD COLUMN IF NOT EXISTS "clinicalIndication" TEXT;
ALTER TABLE "ImagingRequest" ADD COLUMN IF NOT EXISTS "contraindications" TEXT;
