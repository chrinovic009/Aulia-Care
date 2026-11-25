-- ===========================================================================
-- 1. Least privilege for portal patients.
--    Until now a portal patient could read every establishment table guarded
--    by "aulia_clinic_reference_visible" (staff, stock, finance, messages of
--    others...). A patient now reads only:
--      * an explicit allowlist of catalogue tables of their establishment;
--      * their own account and the staff accounts of their care team;
--      * their own clinical rows (unchanged, "aulia_tenant_visible_for_patient").
-- 2. Tables carrying "patientId" without isolation are now isolated, and a
--    guard function lists any tenant table left unprotected (start-up check).
-- 3. Offline replays keep their device time with a reception time and a flag.
-- 4. System-applied pathway steps are journaled without author.
-- 5. Lateness/absence deductions require an explicit, written approval.
-- ===========================================================================

-- 3. Offline traceability -----------------------------------------------------
ALTER TABLE "NursingCareTask" ADD COLUMN "completionReceivedAt" TIMESTAMP(3);
ALTER TABLE "NursingCareTask" ADD COLUMN "completionRecordedOffline" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MedicationAdministration" ADD COLUMN "recordedOffline" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MedicationAdministration" ADD COLUMN "receivedAt" TIMESTAMP(3);

-- 4. System pathway events ----------------------------------------------------
ALTER TABLE "CareEvent" ALTER COLUMN "authorId" DROP NOT NULL;

-- 5. Payroll deduction approval -----------------------------------------------
ALTER TABLE "HrPolicy" ADD COLUMN "deductionsApprovedAt" TIMESTAMP(3);
ALTER TABLE "HrPolicy" ADD COLUMN "deductionsApprovedById" TEXT;
ALTER TABLE "HrPolicy" ADD COLUMN "deductionsLegalBasis" TEXT;
ALTER TABLE "HrPolicy" ADD CONSTRAINT "HrPolicy_deductionsApprovedById_fkey"
  FOREIGN KEY ("deductionsApprovedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 1. Patients no longer pass the generic establishment predicate ---------------
CREATE OR REPLACE FUNCTION "aulia_clinic_reference_visible"(row_clinic TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN coalesce(current_setting('app.user_role', true), '') = 'PATIENT' THEN false
    WHEN coalesce(current_setting('app.clinic_id', true), '') <> ''
      THEN row_clinic = current_setting('app.clinic_id', true)
    WHEN coalesce(current_setting('app.user_role', true), '') = 'DEV'
      THEN true
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION "aulia_is_portal_patient_of"(row_clinic TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(current_setting('app.user_role', true), '') = 'PATIENT'
    AND row_clinic IS NOT NULL
    AND row_clinic = nullif(current_setting('app.patient_clinic_id', true), '');
$$;
GRANT EXECUTE ON FUNCTION "aulia_is_portal_patient_of"(TEXT) TO aulia_app;

-- Catalogue tables a patient may read (booking, prices, plans). Read only.
DO $$
DECLARE
  catalogue TEXT[] := ARRAY['Service', 'ServiceUnit', 'Department', 'WearablePlan'];
  target_table TEXT;
BEGIN
  FOREACH target_table IN ARRAY catalogue LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = target_table AND column_name = 'clinicId') THEN
      RAISE EXCEPTION 'Catalogue table % has no clinicId column', target_table;
    END IF;
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', target_table || '_patient_catalogue', target_table);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING ("aulia_is_portal_patient_of"("clinicId"))', target_table || '_patient_catalogue', target_table);
  END LOOP;
END;
$$;

-- Staff accounts of the patient's care team, same links as the messaging contacts.
CREATE OR REPLACE FUNCTION "aulia_patient_care_team_member"(staff_id TEXT, staff_role TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  WITH me AS (SELECT nullif(current_setting('app.patient_id', true), '') AS patient_id)
  SELECT EXISTS (SELECT 1 FROM me, "Consultation" c WHERE c."patientId" = me.patient_id AND c."providerId" = staff_id)
      OR EXISTS (SELECT 1 FROM me, "Hospitalization" h WHERE h."patientId" = me.patient_id AND h."physicianId" = staff_id)
      OR EXISTS (SELECT 1 FROM me, "Hospitalization" h JOIN "HospitalizationNurseAssignment" a ON a."hospitalizationId" = h."id"
                 WHERE h."patientId" = me.patient_id AND a."nurseId" = staff_id AND a."releasedAt" IS NULL)
      OR EXISTS (SELECT 1 FROM me, "PatientVisit" v WHERE v."patientId" = me.patient_id AND v."receptionistId" = staff_id)
      OR EXISTS (SELECT 1 FROM me, "Appointment" ap WHERE ap."patientId" = me.patient_id AND ap."requestedById" = staff_id)
      OR EXISTS (SELECT 1 FROM me, "TelehealthSession" t WHERE t."patientId" = me.patient_id AND t."doctorId" = staff_id)
      OR EXISTS (SELECT 1 FROM me, "LabRequest" l WHERE l."patientId" = me.patient_id AND (l."requestedById" = staff_id OR staff_role = 'LAB_MANAGER'))
      OR EXISTS (SELECT 1 FROM me, "ImagingRequest" i WHERE i."patientId" = me.patient_id AND (i."requestedById" = staff_id OR staff_role = 'RADIOLOGIST'))
      OR EXISTS (SELECT 1 FROM "ChatMessage" m WHERE (m."senderId" = staff_id AND m."recipientId" = current_setting('app.user_id', true))
                                                OR (m."recipientId" = staff_id AND m."senderId" = current_setting('app.user_id', true)));
$$;
GRANT EXECUTE ON FUNCTION "aulia_patient_care_team_member"(TEXT, TEXT) TO aulia_app;

DROP POLICY IF EXISTS "User_patient_care_team" ON "User";
CREATE POLICY "User_patient_care_team" ON "User" FOR SELECT
  USING ("aulia_is_portal_patient_of"("clinicId") AND "aulia_patient_care_team_member"("id", "primaryRole"::text));

-- A patient reads and writes only the messages they send or receive.
DROP POLICY IF EXISTS "ChatMessage_patient_own" ON "ChatMessage";
CREATE POLICY "ChatMessage_patient_own" ON "ChatMessage"
  USING ("aulia_is_portal_patient_of"("clinicId") AND (
    "senderId" = current_setting('app.user_id', true) OR "recipientId" = current_setting('app.user_id', true)))
  WITH CHECK ("aulia_is_portal_patient_of"("clinicId") AND "senderId" = current_setting('app.user_id', true));

-- 2. Patient-linked tables that had no isolation -------------------------------
CREATE OR REPLACE FUNCTION "aulia_patient_row_visible"(row_patient TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN coalesce(current_setting('app.user_role', true), '') = 'PATIENT'
      THEN row_patient IS NOT NULL AND row_patient = nullif(current_setting('app.patient_id', true), '')
    WHEN row_patient IS NULL THEN true
    -- Staff: the Patient row's own policy decides (same establishment, DEV scope).
    ELSE EXISTS (SELECT 1 FROM "Patient" p WHERE p."id" = row_patient)
  END;
$$;
GRANT EXECUTE ON FUNCTION "aulia_patient_row_visible"(TEXT) TO aulia_app;

DO $$
DECLARE
  linked TEXT[] := ARRAY['EmergencyLocation', 'EmergencyLocationRequest', 'SubscriptionCharge', 'SubscriptionEmployee',
                         'WearableDevice', 'WearableMeasurement', 'WearableSubscription', 'AuditLog'];
  target_table TEXT;
BEGIN
  FOREACH target_table IN ARRAY linked LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', target_table);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', target_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', target_table || '_tenant_isolation', target_table);
    EXECUTE format('CREATE POLICY %I ON %I USING ("aulia_patient_row_visible"("patientId")) WITH CHECK ("aulia_patient_row_visible"("patientId"))',
      target_table || '_tenant_isolation', target_table);
  END LOOP;
END;
$$;

-- Notifications: a recipient always reads their own; patients may raise one
-- about themselves (or with no patient) for staff, never read others'.
ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Notification" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Notification_tenant_isolation" ON "Notification";
CREATE POLICY "Notification_tenant_isolation" ON "Notification"
  USING ("recipientId" = current_setting('app.user_id', true)
         OR (coalesce(current_setting('app.user_role', true), '') <> 'PATIENT' AND "aulia_patient_row_visible"("patientId")))
  WITH CHECK ("patientId" IS NULL OR "aulia_patient_row_visible"("patientId"));

-- Guard: every table holding establishment or patient data must have forced RLS
-- and at least one policy, unless it is listed here with the reason.
CREATE TABLE IF NOT EXISTS "aulia_rls_exemption" (
  "table_name" TEXT PRIMARY KEY,
  "reason" TEXT NOT NULL
);
INSERT INTO "aulia_rls_exemption" ("table_name", "reason") VALUES
  ('AuditLedger', 'Hash chain written by trigger, which must read the whole establishment chain; reads are filtered by clinic in AuditLedgerService and verified by audit_ledger_verify.'),
  ('_prisma_migrations', 'Migration bookkeeping, no tenant data.')
ON CONFLICT ("table_name") DO UPDATE SET "reason" = EXCLUDED."reason";

CREATE OR REPLACE FUNCTION "aulia_unprotected_tenant_tables"()
RETURNS TABLE ("table_name" TEXT)
LANGUAGE sql
STABLE
AS $$
  SELECT c.relname::text
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  WHERE c.relkind = 'r'
    AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname IN ('clinicId', 'patientId') AND NOT a.attisdropped)
    AND NOT (c.relrowsecurity AND c.relforcerowsecurity AND EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid))
    AND NOT EXISTS (SELECT 1 FROM "aulia_rls_exemption" e WHERE e."table_name" = c.relname)
  ORDER BY 1;
$$;
GRANT EXECUTE ON FUNCTION "aulia_unprotected_tenant_tables"() TO aulia_app;
