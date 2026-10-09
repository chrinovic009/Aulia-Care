-- Imaging catalogues are establishment-owned.  Legacy global rows must be
-- assigned by an authorized operator before this constraint can be enabled;
-- guessing a clinic would create a cross-tenant data leak.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "ImagingCatalogue"
    WHERE "clinicId" IS NULL
  ) THEN
    RAISE EXCEPTION
      'ImagingCatalogue contains rows without clinicId. Assign each legacy catalogue explicitly before deploying this migration.';
  END IF;
END $$;

ALTER TABLE "ImagingCatalogue"
  ALTER COLUMN "clinicId" SET NOT NULL;
