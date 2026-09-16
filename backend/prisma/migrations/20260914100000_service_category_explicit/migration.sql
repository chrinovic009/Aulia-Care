-- The initial hardening migration assigned CONSULTATION as a database default.
-- That is unsafe for laboratories, imaging, pharmacy and administration. This
-- additive repair first derives categories from the structured Department.type
-- and only then removes the implicit default for all future writes.

UPDATE "ServiceUnit" AS unit
SET "category" = CASE department."type"
  WHEN 'RECEPTION' THEN 'ADMINISTRATION'::"ServiceCategory"
  WHEN 'BILLING' THEN 'ADMINISTRATION'::"ServiceCategory"
  WHEN 'ADMINISTRATION' THEN 'ADMINISTRATION'::"ServiceCategory"
  WHEN 'LABORATORY' THEN 'LABORATORY'::"ServiceCategory"
  WHEN 'RADIOLOGY' THEN 'IMAGING'::"ServiceCategory"
  WHEN 'PHARMACY' THEN 'PHARMACY'::"ServiceCategory"
  WHEN 'MEDICAL' THEN 'CONSULTATION'::"ServiceCategory"
  WHEN 'NURSING' THEN 'OTHER_CLINICAL'::"ServiceCategory"
  WHEN 'SURGERY' THEN 'OTHER_CLINICAL'::"ServiceCategory"
  ELSE unit."category"
END
FROM "Department" AS department
WHERE department."id" = unit."departmentId";

-- A Service has no department foreign key. The existing exact clinic/name
-- linkage to a single ServiceUnit is therefore the only deterministic legacy
-- relation available. Ambiguous or unlinked rows are intentionally untouched
-- and must be reviewed by the readiness audit rather than guessed.
WITH resolved_service_categories AS (
  SELECT
    unit."clinicId",
    unit."name",
    MIN(unit."category"::text) AS "category"
  FROM "ServiceUnit" AS unit
  WHERE unit."clinicId" IS NOT NULL
  GROUP BY unit."clinicId", unit."name"
  HAVING COUNT(DISTINCT unit."category") = 1
)
UPDATE "Service" AS service
SET "category" = resolved."category"::"ServiceCategory"
FROM resolved_service_categories AS resolved
WHERE service."clinicId" = resolved."clinicId"
  AND service."name" = resolved."name";

ALTER TABLE "ServiceUnit" ALTER COLUMN "category" DROP DEFAULT;
ALTER TABLE "Service" ALTER COLUMN "category" DROP DEFAULT;
