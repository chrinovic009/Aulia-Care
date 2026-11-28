-- ===========================================================================
-- Tenant isolation on every table that belongs to an establishment.
--
-- Until now Row-Level Security covered the clinical core (patients, stays,
-- prescriptions, invoices, care workflow). It now covers:
--   1. every other table carrying "clinicId" (catalogues, staff, stock,
--      finance, messaging...), with the same fail-closed rule: a request with
--      no establishment sees nothing, except the platform DEV;
--   2. the patient's child records that carry only "patientId" (vital signs,
--      allergies, diagnoses...): visible only when the patient is visible;
--   3. the child rows of clinical and financial documents (invoice lines,
--      laboratory items and results, imaging reports, prescription lines...):
--      visible only when their parent document is visible.
-- A connection outside an API request keeps its owner role (migrations,
-- background jobs) as before.
-- ===========================================================================

-- Organisation data, catalogues and staff: members of the establishment, its
-- portal patients (read their own establishment only) and the platform DEV.
CREATE OR REPLACE FUNCTION "aulia_clinic_reference_visible"(row_clinic TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN coalesce(current_setting('app.user_role', true), '') = 'PATIENT'
      THEN row_clinic IS NOT NULL AND row_clinic = nullif(current_setting('app.patient_clinic_id', true), '')
    WHEN coalesce(current_setting('app.clinic_id', true), '') <> ''
      THEN row_clinic = current_setting('app.clinic_id', true)
    WHEN coalesce(current_setting('app.user_role', true), '') = 'DEV'
      THEN true
    ELSE false
  END;
$$;
GRANT EXECUTE ON FUNCTION "aulia_clinic_reference_visible"(TEXT) TO aulia_app;

DO $$
DECLARE
  target RECORD;
  predicate TEXT;
  -- Already protected by a dedicated policy, or written by triggers/operators only.
  excluded TEXT[] := ARRAY['AuditLedger', 'IdempotencyRecord', 'ConsultationPolicy', 'ConsultationReferral'];
BEGIN
  -- 1. Every table with a clinicId column that has no isolation yet.
  FOR target IN
    SELECT c.table_name
    FROM information_schema.columns AS c
    JOIN pg_class AS k ON k.relname = c.table_name
    JOIN pg_namespace AS n ON n.oid = k.relnamespace AND n.nspname = 'public'
    WHERE c.table_schema = 'public' AND c.column_name = 'clinicId' AND k.relkind = 'r'
      AND NOT k.relrowsecurity
      AND NOT (c.table_name = ANY (excluded))
  LOOP
    IF target.table_name = 'User' THEN
      -- A person always reads their own account (portal patients and DEV have no clinicId).
      predicate := '("id" = nullif(current_setting(''app.user_id'', true), '''') OR "aulia_clinic_reference_visible"("clinicId"))';
    ELSIF EXISTS (
      SELECT 1 FROM information_schema.columns AS p
      WHERE p.table_schema = 'public' AND p.table_name = target.table_name AND p.column_name = 'patientId'
    ) THEN
      predicate := '"aulia_tenant_visible_for_patient"("clinicId", "patientId")';
    ELSE
      predicate := '"aulia_clinic_reference_visible"("clinicId")';
    END IF;
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', target.table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', target.table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', target.table_name || '_tenant_isolation', target.table_name);
    EXECUTE format('CREATE POLICY %I ON %I USING (%s) WITH CHECK (%s)', target.table_name || '_tenant_isolation', target.table_name, predicate, predicate);
  END LOOP;
END;
$$;

-- 2 and 3. Child rows follow their parent: the EXISTS below is itself filtered
-- by the parent's policy, so a child is visible exactly when its parent is.
DO $$
DECLARE
  link TEXT[];
  links TEXT[][] := ARRAY[
    -- child table, foreign key, parent table
    ARRAY['PatientContact', 'patientId', 'Patient'], ARRAY['MedicalHistory', 'patientId', 'Patient'],
    ARRAY['VitalSign', 'patientId', 'Patient'], ARRAY['Surgery', 'patientId', 'Patient'],
    ARRAY['LabCriticalAlert', 'patientId', 'Patient'], ARRAY['Diagnosis', 'patientId', 'Patient'],
    ARRAY['ProblemList', 'patientId', 'Patient'], ARRAY['Allergy', 'patientId', 'Patient'],
    ARRAY['Vaccination', 'patientId', 'Patient'], ARRAY['ClinicalCondition', 'patientId', 'Patient'],
    ARRAY['InsurancePolicy', 'patientId', 'Patient'], ARRAY['InsuranceClaim', 'patientId', 'Patient'],
    ARRAY['InsuranceAuthorization', 'patientId', 'Patient'], ARRAY['TelehealthSession', 'patientId', 'Patient'],
    ARRAY['ParamedicalVoucher', 'patientId', 'Patient'], ARRAY['ConnectedCareConsent', 'patientId', 'Patient'],
    ARRAY['InvoiceLine', 'invoiceId', 'Invoice'],
    ARRAY['LabRequestItem', 'labRequestId', 'LabRequest'], ARRAY['LabResult', 'labRequestId', 'LabRequest'],
    ARRAY['LabSample', 'labRequestId', 'LabRequest'], ARRAY['LabRequestEvent', 'labRequestId', 'LabRequest'],
    ARRAY['LabReport', 'labRequestId', 'LabRequest'], ARRAY['LabResultParameter', 'labResultId', 'LabResult'],
    ARRAY['LabSampleTrackingEvent', 'labSampleId', 'LabSample'],
    ARRAY['ImagingReport', 'imagingRequestId', 'ImagingRequest'],
    ARRAY['PrescriptionLine', 'prescriptionId', 'Prescription'],
    ARRAY['MedicationAdministration', 'hospitalizationId', 'Hospitalization'],
    ARRAY['NursingCareTask', 'hospitalizationId', 'Hospitalization']
  ];
  predicate TEXT;
BEGIN
  FOREACH link SLICE 1 IN ARRAY links LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = link[1] AND column_name = link[2]) THEN
      CONTINUE;
    END IF;
    predicate := format('EXISTS (SELECT 1 FROM %I AS parent WHERE parent."id" = %I.%I)', link[3], link[1], link[2]);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', link[1]);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', link[1]);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', link[1] || '_tenant_isolation', link[1]);
    EXECUTE format('CREATE POLICY %I ON %I USING (%s) WITH CHECK (%s)', link[1] || '_tenant_isolation', link[1], predicate, predicate);
  END LOOP;
END;
$$;
