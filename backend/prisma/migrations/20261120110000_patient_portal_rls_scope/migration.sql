-- A missing clinic is not an authorization grant. Platform DEV keeps its
-- explicit cross-clinic scope; portal patients are limited to their linked
-- Patient row and records carrying that patientId.
CREATE OR REPLACE FUNCTION "aulia_tenant_visible_for_patient"(row_clinic TEXT, row_patient TEXT DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN coalesce(current_setting('app.user_role', true), '') = 'PATIENT'
      THEN row_patient IS NOT NULL
        AND row_patient = nullif(current_setting('app.patient_id', true), '')
        AND row_clinic = nullif(current_setting('app.patient_clinic_id', true), '')
    WHEN coalesce(current_setting('app.clinic_id', true), '') <> ''
      THEN row_clinic = current_setting('app.clinic_id', true)
    WHEN coalesce(current_setting('app.user_role', true), '') = 'DEV'
      THEN true
    ELSE false
  END;
$$;

GRANT EXECUTE ON FUNCTION "aulia_tenant_visible_for_patient"(TEXT, TEXT) TO aulia_app;

DO $$
DECLARE
  isolated TEXT[] := ARRAY[
    'Patient', 'PatientVisit', 'PatientDeathRecord', 'Appointment', 'Hospitalization', 'Consultation',
    'Prescription', 'PrescriptionReplacement', 'PharmacyDispense', 'LabRequest', 'ImagingRequest',
    'ImagingReportAmendment', 'Invoice', 'Payment', 'RefundRequest',
    'CareUnit', 'CareUnitAssignment', 'CareEpisode', 'ServiceRequest', 'CareTask', 'CareEvent', 'CareTransfer'
  ];
  target_table TEXT;
  patient_column TEXT;
  predicate TEXT;
BEGIN
  FOREACH target_table IN ARRAY isolated LOOP
    IF target_table = 'Patient' THEN
      patient_column := 'id';
    ELSIF EXISTS (
      SELECT 1 FROM information_schema.columns AS c
      WHERE c.table_schema = 'public' AND c.table_name = target_table AND c.column_name = 'patientId'
    ) THEN
      patient_column := '"patientId"';
    ELSE
      patient_column := NULL;
    END IF;

    predicate := CASE
      WHEN patient_column IS NULL THEN '"aulia_tenant_visible_for_patient"("clinicId", NULL)'
      ELSE format('"aulia_tenant_visible_for_patient"("clinicId", %s)', patient_column)
    END;
    IF target_table = 'Patient' THEN
      predicate := predicate || ' AND (current_setting(''app.user_role'', true) IS DISTINCT FROM ''PATIENT'' OR "portalUserId" = current_setting(''app.user_id'', true))';
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', target_table || '_tenant_isolation', target_table);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (%s) WITH CHECK (%s)',
      target_table || '_tenant_isolation', target_table, predicate, predicate
    );
  END LOOP;
END;
$$;
