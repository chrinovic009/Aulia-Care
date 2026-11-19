-- Existing contracts require explicit human confirmation of global coverage.
-- A false default preserves the safer historical behaviour: no silent coverage.
ALTER TABLE "SubscriptionCompany"
  ADD COLUMN "coversAllServices" BOOLEAN NOT NULL DEFAULT false;
