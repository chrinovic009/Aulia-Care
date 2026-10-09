-- Corporate subscription contracts are owned by one clinic.  The column is
-- intentionally nullable for this additive migration: legacy contracts must
-- be reviewed and repaired explicitly, never guessed as belonging to a clinic.
ALTER TABLE "SubscriptionCompany"
ADD COLUMN "clinicId" TEXT;

CREATE INDEX "SubscriptionCompany_clinicId_status_idx"
ON "SubscriptionCompany"("clinicId", "status");

ALTER TABLE "SubscriptionCompany"
ADD CONSTRAINT "SubscriptionCompany_clinicId_fkey"
FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
