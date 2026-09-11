-- Renaming an enum value preserves its PostgreSQL OID and therefore every
-- existing per-clinic entitlement. No configuration row or table is rebuilt.
ALTER TYPE "AuliaLayer" RENAME VALUE 'AI' TO 'DIAGNOSTIC';

-- A platform-layer configuration without a tenant can never be authoritative.
-- The preceding tenant migration/backfill establishes this invariant before
-- this additive constraint is applied.
ALTER TABLE "PlatformLayerConfiguration"
  ALTER COLUMN "enabledLayers" SET DEFAULT ARRAY[]::"AuliaLayer"[];

ALTER TABLE "PlatformLayerConfiguration"
  ALTER COLUMN "clinicId" SET NOT NULL;
