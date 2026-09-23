-- Laboratory tenant hardening
-- Aulia Care
--
-- Objectif :
-- 1. Conserver le catalogue scientifique du laboratoire global.
-- 2. Rendre les configurations, stocks et mouvements propres à chaque clinique.
-- 3. Introduire ClinicLabTest pour les paramètres locaux des examens.
--
-- IMPORTANT :
-- Cette migration refuse de s'exécuter si des données opérationnelles
-- existent déjà dans les tables à tenantiser. Aucun rattachement automatique
-- à une clinique n'est effectué.

-- ============================================================
-- SAFETY GATE
-- ============================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "LabConsumableStock")
       OR EXISTS (SELECT 1 FROM "LabConsumableTransaction")
       OR EXISTS (SELECT 1 FROM "LabConfiguration") THEN
        RAISE EXCEPTION
            'Laboratory tenant hardening requires empty LabConsumableStock, LabConsumableTransaction and LabConfiguration tables.';
    END IF;
END
$$;

-- ============================================================
-- LAB CONFIGURATION
-- ============================================================

DROP INDEX "LabConfiguration_key_key";

ALTER TABLE "LabConfiguration"
    ADD COLUMN "clinicId" TEXT NOT NULL;

CREATE INDEX "LabConfiguration_clinicId_idx"
    ON "LabConfiguration"("clinicId");

CREATE UNIQUE INDEX "LabConfiguration_clinicId_key_key"
    ON "LabConfiguration"("clinicId", "key");

ALTER TABLE "LabConfiguration"
    ADD CONSTRAINT "LabConfiguration_clinicId_fkey"
    FOREIGN KEY ("clinicId")
    REFERENCES "Clinic"("id")
    ON DELETE RESTRICT
    ON UPDATE CASCADE;

-- ============================================================
-- LAB CONSUMABLE STOCK
-- ============================================================

ALTER TABLE "LabConsumableStock"
    DROP CONSTRAINT "LabConsumableStock_labConsumableId_fkey";

ALTER TABLE "LabConsumableStock"
    ADD COLUMN "clinicId" TEXT NOT NULL;

CREATE INDEX "LabConsumableStock_clinicId_idx"
    ON "LabConsumableStock"("clinicId");

CREATE INDEX "LabConsumableStock_clinicId_archivedAt_idx"
    ON "LabConsumableStock"("clinicId", "archivedAt");

CREATE INDEX "LabConsumableStock_clinicId_labConsumableId_idx"
    ON "LabConsumableStock"("clinicId", "labConsumableId");

ALTER TABLE "LabConsumableStock"
    ADD CONSTRAINT "LabConsumableStock_clinicId_fkey"
    FOREIGN KEY ("clinicId")
    REFERENCES "Clinic"("id")
    ON DELETE RESTRICT
    ON UPDATE CASCADE;

ALTER TABLE "LabConsumableStock"
    ADD CONSTRAINT "LabConsumableStock_labConsumableId_fkey"
    FOREIGN KEY ("labConsumableId")
    REFERENCES "LabConsumable"("id")
    ON DELETE RESTRICT
    ON UPDATE CASCADE;

-- ============================================================
-- LAB CONSUMABLE TRANSACTIONS
-- ============================================================

ALTER TABLE "LabConsumableTransaction"
    DROP CONSTRAINT "LabConsumableTransaction_labConsumableId_fkey";

ALTER TABLE "LabConsumableTransaction"
    ADD COLUMN "clinicId" TEXT NOT NULL;

CREATE INDEX "LabConsumableTransaction_clinicId_idx"
    ON "LabConsumableTransaction"("clinicId");

CREATE INDEX "LabConsumableTransaction_clinicId_createdAt_idx"
    ON "LabConsumableTransaction"("clinicId", "createdAt");

CREATE INDEX "LabConsumableTransaction_clinicId_labConsumableId_idx"
    ON "LabConsumableTransaction"("clinicId", "labConsumableId");

ALTER TABLE "LabConsumableTransaction"
    ADD CONSTRAINT "LabConsumableTransaction_clinicId_fkey"
    FOREIGN KEY ("clinicId")
    REFERENCES "Clinic"("id")
    ON DELETE RESTRICT
    ON UPDATE CASCADE;

ALTER TABLE "LabConsumableTransaction"
    ADD CONSTRAINT "LabConsumableTransaction_labConsumableId_fkey"
    FOREIGN KEY ("labConsumableId")
    REFERENCES "LabConsumable"("id")
    ON DELETE RESTRICT
    ON UPDATE CASCADE;

-- ============================================================
-- CLINIC-SPECIFIC LAB TEST CONFIGURATION
-- ============================================================

CREATE TABLE "ClinicLabTest" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "labTestId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "price" DECIMAL(12,2),
    "turnaroundTimeMinutes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicLabTest_pkey"
        PRIMARY KEY ("id")
);

CREATE INDEX "ClinicLabTest_clinicId_active_idx"
    ON "ClinicLabTest"("clinicId", "active");

CREATE INDEX "ClinicLabTest_labTestId_idx"
    ON "ClinicLabTest"("labTestId");

CREATE UNIQUE INDEX "ClinicLabTest_clinicId_labTestId_key"
    ON "ClinicLabTest"("clinicId", "labTestId");

ALTER TABLE "ClinicLabTest"
    ADD CONSTRAINT "ClinicLabTest_clinicId_fkey"
    FOREIGN KEY ("clinicId")
    REFERENCES "Clinic"("id")
    ON DELETE RESTRICT
    ON UPDATE CASCADE;

ALTER TABLE "ClinicLabTest"
    ADD CONSTRAINT "ClinicLabTest_labTestId_fkey"
    FOREIGN KEY ("labTestId")
    REFERENCES "LabTest"("id")
    ON DELETE RESTRICT
    ON UPDATE CASCADE;
