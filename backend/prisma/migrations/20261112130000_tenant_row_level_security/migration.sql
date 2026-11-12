-- ===========================================================================
-- Tenant isolation enforced by PostgreSQL (Row-Level Security).
--
-- * aulia_app: restricted role (no login, not superuser, no BYPASSRLS). During
--   an authenticated API request every transaction runs SET LOCAL ROLE aulia_app
--   and declares app.clinic_id; a superuser connection would otherwise bypass RLS.
-- * aulia_tenant_visible(): a row is visible and writable only when its clinicId
--   equals the request's establishment. Outside a request (login, background
--   jobs, migrations) or for the platform DEV role (no establishment), the
--   setting is empty and no filter applies.
-- ===========================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aulia_app') THEN
    CREATE ROLE aulia_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
  -- The connection user must be allowed to switch to the restricted role.
  EXECUTE format('GRANT aulia_app TO %I', current_user);
END;
$$;

GRANT USAGE ON SCHEMA public TO aulia_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO aulia_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO aulia_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO aulia_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO aulia_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO aulia_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO aulia_app;

CREATE OR REPLACE FUNCTION "aulia_tenant_visible"(row_clinic TEXT) RETURNS BOOLEAN AS $$
  SELECT coalesce(current_setting('app.clinic_id', true), '') = ''
      OR row_clinic = current_setting('app.clinic_id', true);
$$ LANGUAGE sql STABLE;

DO $$
DECLARE
  isolated TEXT[] := ARRAY[
    'Patient', 'PatientVisit', 'PatientDeathRecord', 'Appointment', 'Hospitalization', 'Consultation',
    'Prescription', 'PrescriptionReplacement', 'PharmacyDispense', 'LabRequest', 'ImagingRequest',
    'ImagingReportAmendment', 'Invoice', 'Payment', 'RefundRequest',
    'CareUnit', 'CareUnitAssignment', 'CareEpisode', 'ServiceRequest', 'CareTask', 'CareEvent', 'CareTransfer'
  ];
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY isolated LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING ("aulia_tenant_visible"("clinicId")) WITH CHECK ("aulia_tenant_visible"("clinicId"))',
      table_name || '_tenant_isolation', table_name
    );
  END LOOP;
END;
$$;
