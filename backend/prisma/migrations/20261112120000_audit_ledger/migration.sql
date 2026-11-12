-- CreateTable
CREATE TABLE "AuditLedger" (
    "id" BIGSERIAL NOT NULL,
    "clinicId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT,
    "actorRole" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "data" JSONB,
    "context" JSONB,
    "prevHash" TEXT,
    "hash" TEXT,

    CONSTRAINT "AuditLedger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLedger_clinicId_id_idx" ON "AuditLedger"("clinicId", "id");

-- CreateIndex
CREATE INDEX "AuditLedger_entity_entityId_idx" ON "AuditLedger"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLedger_actorId_occurredAt_idx" ON "AuditLedger"("actorId", "occurredAt");

-- ===========================================================================
-- Tamper-evident audit ledger.
-- * audit_ledger_chain (BEFORE INSERT): serialises per establishment, assigns a
--   monotonic id, server time, and a SHA-256 hash chained to the previous row.
-- * the ledger refuses UPDATE, DELETE and TRUNCATE.
-- * audit_capture (AFTER ROW): every INSERT / UPDATE / DELETE on the audited
--   tables is written to the ledger, whatever code path performed it. The actor
--   comes from the transaction settings app.user_id / app.user_role / app.route
--   set by the API; secrets (hash, token, secret, password columns) are removed.
-- ===========================================================================

CREATE OR REPLACE FUNCTION "audit_ledger_hash"(
  p_prev TEXT, p_id BIGINT, p_clinic TEXT, p_at TIMESTAMP, p_actor TEXT, p_role TEXT,
  p_action TEXT, p_entity TEXT, p_entity_id TEXT, p_data JSONB, p_context JSONB
) RETURNS TEXT AS $$
  SELECT encode(sha256(convert_to(concat_ws('|',
    coalesce(p_prev, ''), p_id::text, coalesce(p_clinic, ''),
    to_char(p_at, 'YYYY-MM-DD"T"HH24:MI:SS.US'), coalesce(p_actor, ''), coalesce(p_role, ''),
    p_action, p_entity, coalesce(p_entity_id, ''), coalesce(p_data::text, ''), coalesce(p_context::text, '')
  ), 'UTF8')), 'hex');
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION "audit_ledger_chain"() RETURNS trigger AS $$
DECLARE
  previous TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('audit-ledger:' || coalesce(NEW."clinicId", '-')));
  NEW."id" := nextval(pg_get_serial_sequence('"AuditLedger"', 'id'));
  -- Truncated to the column precision (ms) so the stored value is exactly the hashed one.
  NEW."occurredAt" := date_trunc('milliseconds', clock_timestamp() AT TIME ZONE 'UTC');
  SELECT "hash" INTO previous FROM "AuditLedger"
   WHERE "clinicId" IS NOT DISTINCT FROM NEW."clinicId"
   ORDER BY "id" DESC LIMIT 1;
  NEW."prevHash" := previous;
  NEW."hash" := "audit_ledger_hash"(previous, NEW."id", NEW."clinicId", NEW."occurredAt", NEW."actorId", NEW."actorRole",
    NEW."action", NEW."entity", NEW."entityId", NEW."data", NEW."context");
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AuditLedger_chain" BEFORE INSERT ON "AuditLedger"
  FOR EACH ROW EXECUTE FUNCTION "audit_ledger_chain"();

CREATE OR REPLACE FUNCTION "audit_ledger_is_immutable"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLedger est en ajout seul : % refusé.', TG_OP USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AuditLedger_insert_only" BEFORE UPDATE OR DELETE ON "AuditLedger"
  FOR EACH ROW EXECUTE FUNCTION "audit_ledger_is_immutable"();
CREATE TRIGGER "AuditLedger_no_truncate" BEFORE TRUNCATE ON "AuditLedger"
  FOR EACH STATEMENT EXECUTE FUNCTION "audit_ledger_is_immutable"();

-- Walks one establishment's chain; returns how many rows were checked and the
-- first row whose hash or link does not match (NULL when the chain is intact).
CREATE OR REPLACE FUNCTION "audit_ledger_verify"(p_clinic TEXT)
RETURNS TABLE ("checked" BIGINT, "firstInvalidId" BIGINT) AS $$
DECLARE
  item RECORD;
  previous TEXT := NULL;
  total BIGINT := 0;
BEGIN
  FOR item IN SELECT * FROM "AuditLedger" WHERE "clinicId" IS NOT DISTINCT FROM p_clinic ORDER BY "id" LOOP
    total := total + 1;
    IF item."prevHash" IS DISTINCT FROM previous
       OR item."hash" IS DISTINCT FROM "audit_ledger_hash"(previous, item."id", item."clinicId", item."occurredAt", item."actorId",
            item."actorRole", item."action", item."entity", item."entityId", item."data", item."context") THEN
      RETURN QUERY SELECT total, item."id";
      RETURN;
    END IF;
    previous := item."hash";
  END LOOP;
  RETURN QUERY SELECT total, NULL::BIGINT;
END;
$$ LANGUAGE plpgsql STABLE;

-- Establishment of an audited row, from its own clinicId or its parent record.
CREATE OR REPLACE FUNCTION "audit_resolve_clinic"(r JSONB) RETURNS TEXT AS $$
DECLARE
  found TEXT;
BEGIN
  IF r ->> 'clinicId' IS NOT NULL THEN RETURN r ->> 'clinicId'; END IF;
  IF r ->> 'patientId' IS NOT NULL THEN
    SELECT "clinicId" INTO found FROM "Patient" WHERE "id" = r ->> 'patientId';
  ELSIF r ->> 'consultationId' IS NOT NULL THEN
    SELECT "clinicId" INTO found FROM "Consultation" WHERE "id" = r ->> 'consultationId';
  ELSIF r ->> 'prescriptionId' IS NOT NULL THEN
    SELECT "clinicId" INTO found FROM "Prescription" WHERE "id" = r ->> 'prescriptionId';
  ELSIF r ->> 'hospitalizationId' IS NOT NULL THEN
    SELECT "clinicId" INTO found FROM "Hospitalization" WHERE "id" = r ->> 'hospitalizationId';
  ELSIF r ->> 'labRequestId' IS NOT NULL THEN
    SELECT "clinicId" INTO found FROM "LabRequest" WHERE "id" = r ->> 'labRequestId';
  ELSIF r ->> 'labResultId' IS NOT NULL THEN
    SELECT q."clinicId" INTO found FROM "LabResult" res JOIN "LabRequest" q ON q."id" = res."labRequestId" WHERE res."id" = r ->> 'labResultId';
  ELSIF r ->> 'imagingRequestId' IS NOT NULL THEN
    SELECT "clinicId" INTO found FROM "ImagingRequest" WHERE "id" = r ->> 'imagingRequestId';
  ELSIF r ->> 'surgeryId' IS NOT NULL THEN
    SELECT p."clinicId" INTO found FROM "Surgery" s JOIN "Patient" p ON p."id" = s."patientId" WHERE s."id" = r ->> 'surgeryId';
  ELSIF r ->> 'userId' IS NOT NULL THEN
    SELECT "clinicId" INTO found FROM "User" WHERE "id" = r ->> 'userId';
  END IF;
  RETURN coalesce(found, nullif(current_setting('app.clinic_id', true), ''));
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION "audit_strip_secrets"(r JSONB) RETURNS JSONB AS $$
  SELECT coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
    FROM jsonb_each(r)
   WHERE key !~* '(hash|token|secret|password)';
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION "audit_capture"() RETURNS trigger AS $$
DECLARE
  old_row JSONB := CASE WHEN TG_OP <> 'INSERT' THEN "audit_strip_secrets"(to_jsonb(OLD)) END;
  new_row JSONB := CASE WHEN TG_OP <> 'DELETE' THEN "audit_strip_secrets"(to_jsonb(NEW)) END;
  subject JSONB := coalesce(new_row, old_row);
  payload JSONB;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    SELECT jsonb_object_agg(n.key, jsonb_build_array(old_row -> n.key, n.value)) INTO payload
      FROM jsonb_each(new_row) n
     WHERE n.key NOT IN ('updatedAt', 'version', 'syncedAt', 'sourceNode')
       AND (old_row -> n.key) IS DISTINCT FROM n.value;
    IF payload IS NULL THEN RETURN NULL; END IF;
    payload := jsonb_build_object('changes', payload);
  ELSIF TG_OP = 'INSERT' THEN
    payload := jsonb_build_object('after', new_row);
  ELSE
    payload := jsonb_build_object('before', old_row);
  END IF;

  INSERT INTO "AuditLedger" ("clinicId", "actorId", "actorRole", "action", "entity", "entityId", "data", "context")
  VALUES (
    "audit_resolve_clinic"(subject),
    nullif(current_setting('app.user_id', true), ''),
    nullif(current_setting('app.user_role', true), ''),
    TG_OP,
    TG_TABLE_NAME,
    subject ->> 'id',
    payload,
    jsonb_strip_nulls(jsonb_build_object('route', nullif(current_setting('app.route', true), '')))
  );
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  audited TEXT[] := ARRAY[
    'Patient', 'PatientContact', 'MedicalHistory', 'PatientDeathRecord', 'Hospitalization', 'VitalSign',
    'Consultation', 'ConsultationNote', 'Prescription', 'PrescriptionLine', 'PrescriptionReplacement',
    'NursingCareTask', 'MedicationAdministration', 'PharmacyDispense', 'LabRequest', 'LabResult',
    'LabResultParameter', 'ImagingRequest', 'ImagingReport', 'ImagingReportAmendment', 'Surgery',
    'SurgerySafetyChecklist', 'Diagnosis', 'ProblemList', 'Allergy', 'Vaccination', 'ClinicalCondition',
    'User', 'UserRole', 'CareUnit', 'CareUnitAssignment', 'CareEpisode', 'ServiceRequest', 'CareTask',
    'CareTransfer', 'Invoice', 'Payment', 'RefundRequest', 'InvoiceDiscountRequest'
  ];
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY audited LOOP
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION "audit_capture"()',
      table_name || '_audit_ledger', table_name
    );
  END LOOP;
END;
$$;
