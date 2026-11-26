-- Identity and session records carry userId/actorId rather than clinicId.
-- They therefore need an explicit guard in addition to tenant-table RLS.
-- Public authentication runs in a narrow AUTH_LOGIN context; verified token
-- refresh and session validation run with the authenticated user's own id.

CREATE OR REPLACE FUNCTION "aulia_identity_user_in_scope"(target_user TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT target_user IS NOT NULL AND (
    target_user = nullif(current_setting('app.user_id', true), '')
    OR coalesce(current_setting('app.user_role', true), '') = 'SECURITY_MAINTENANCE'
    OR EXISTS (
      SELECT 1 FROM "User" u
      WHERE u."id" = target_user
        AND (
          "aulia_clinic_reference_visible"(u."clinicId")
          OR EXISTS (
            SELECT 1 FROM "Patient" p
            WHERE p."portalUserId" = u."id"
              AND "aulia_tenant_visible_for_patient"(p."clinicId", p."id")
          )
        )
    )
  );
$$;
GRANT EXECUTE ON FUNCTION "aulia_identity_user_in_scope"(TEXT) TO aulia_app;

CREATE OR REPLACE FUNCTION "aulia_identity_admin_for"(target_user TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(current_setting('app.user_role', true), '') IN ('SECURITY_MAINTENANCE', 'DEV')
    OR (
      coalesce(current_setting('app.user_role', true), '') IN ('ADMIN', 'SUPER_ADMIN')
      AND EXISTS (
        SELECT 1 FROM "User" u
        WHERE u."id" = target_user
          AND u."clinicId" = nullif(current_setting('app.clinic_id', true), '')
      )
    );
$$;
GRANT EXECUTE ON FUNCTION "aulia_identity_admin_for"(TEXT) TO aulia_app;

-- The public login service must resolve an account and its employee matricule.
-- This context is created only inside AuthController, never from a client role.
DROP POLICY IF EXISTS "User_auth_login" ON "User";
CREATE POLICY "User_auth_login" ON "User" FOR SELECT
  USING (coalesce(current_setting('app.user_role', true), '') = 'AUTH_LOGIN');
DROP POLICY IF EXISTS "User_auth_login_update" ON "User";
CREATE POLICY "User_auth_login_update" ON "User" FOR UPDATE
  USING (coalesce(current_setting('app.user_role', true), '') = 'AUTH_LOGIN')
  WITH CHECK (coalesce(current_setting('app.user_role', true), '') = 'AUTH_LOGIN');
DROP POLICY IF EXISTS "Employee_auth_login" ON "Employee";
CREATE POLICY "Employee_auth_login" ON "Employee" FOR SELECT
  USING (coalesce(current_setting('app.user_role', true), '') = 'AUTH_LOGIN');
-- During the first JWT guard pass, only the signed token owner's portal link
-- is needed to establish the real patient/clinic context for the second pass.
DROP POLICY IF EXISTS "Patient_auth_session_read" ON "Patient";
CREATE POLICY "Patient_auth_session_read" ON "Patient" FOR SELECT
  USING (coalesce(current_setting('app.user_role', true), '') = 'AUTH_SESSION'
         AND "portalUserId" = nullif(current_setting('app.user_id', true), ''));
DROP POLICY IF EXISTS "User_security_maintenance" ON "User";
CREATE POLICY "User_security_maintenance" ON "User" FOR SELECT
  USING (coalesce(current_setting('app.user_role', true), '') = 'SECURITY_MAINTENANCE');
DROP POLICY IF EXISTS "User_security_maintenance_update" ON "User";
CREATE POLICY "User_security_maintenance_update" ON "User" FOR UPDATE
  USING (coalesce(current_setting('app.user_role', true), '') = 'SECURITY_MAINTENANCE')
  WITH CHECK (coalesce(current_setting('app.user_role', true), '') = 'SECURITY_MAINTENANCE');

DROP POLICY IF EXISTS "PasswordResetRequest_auth_login_select" ON "PasswordResetRequest";
CREATE POLICY "PasswordResetRequest_auth_login_select" ON "PasswordResetRequest" FOR SELECT
  USING (coalesce(current_setting('app.user_role', true), '') = 'AUTH_LOGIN');
DROP POLICY IF EXISTS "PasswordResetRequest_auth_login_insert" ON "PasswordResetRequest";
CREATE POLICY "PasswordResetRequest_auth_login_insert" ON "PasswordResetRequest" FOR INSERT
  WITH CHECK (coalesce(current_setting('app.user_role', true), '') = 'AUTH_LOGIN');

DO $$
DECLARE
  target_table TEXT;
  identity_tables TEXT[] := ARRAY[
    'UserRole', 'RefreshToken', 'PasswordHistory', 'LoginAttempt', 'Session',
    'SessionRefreshTokenHistory', 'PasswordResetToken', 'AuditTrail'
  ];
BEGIN
  FOREACH target_table IN ARRAY identity_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', target_table);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', target_table);
  END LOOP;
END;
$$;

-- Additional role grants are readable by staff in the same establishment, but
-- only an administrator of that establishment (or platform DEV) may change them.
DROP POLICY IF EXISTS "UserRole_identity_read" ON "UserRole";
CREATE POLICY "UserRole_identity_read" ON "UserRole" FOR SELECT USING (
  "userId" = nullif(current_setting('app.user_id', true), '')
  OR (coalesce(current_setting('app.user_role', true), '') NOT IN ('', 'PATIENT', 'AUTH_LOGIN')
      AND "aulia_identity_user_in_scope"("userId"))
);
DROP POLICY IF EXISTS "UserRole_identity_admin_write" ON "UserRole";
CREATE POLICY "UserRole_identity_admin_write" ON "UserRole" FOR INSERT
  WITH CHECK ("aulia_identity_admin_for"("userId"));
DROP POLICY IF EXISTS "UserRole_identity_admin_update" ON "UserRole";
CREATE POLICY "UserRole_identity_admin_update" ON "UserRole" FOR UPDATE
  USING ("aulia_identity_admin_for"("userId"))
  WITH CHECK ("aulia_identity_admin_for"("userId"));
DROP POLICY IF EXISTS "UserRole_identity_admin_delete" ON "UserRole";
CREATE POLICY "UserRole_identity_admin_delete" ON "UserRole" FOR DELETE
  USING ("aulia_identity_admin_for"("userId"));

-- A session and its consumed refresh hashes belong only to their holder.
-- Administrators may revoke sessions in their establishment without reading hashes.
DROP POLICY IF EXISTS "Session_identity_owner" ON "Session";
CREATE POLICY "Session_identity_owner" ON "Session" FOR SELECT
  USING ("userId" = nullif(current_setting('app.user_id', true), ''));
DROP POLICY IF EXISTS "Session_identity_owner_insert" ON "Session";
CREATE POLICY "Session_identity_owner_insert" ON "Session" FOR INSERT
  WITH CHECK ("userId" = nullif(current_setting('app.user_id', true), ''));
DROP POLICY IF EXISTS "Session_identity_owner_update" ON "Session";
CREATE POLICY "Session_identity_owner_update" ON "Session" FOR UPDATE
  USING ("userId" = nullif(current_setting('app.user_id', true), ''))
  WITH CHECK ("userId" = nullif(current_setting('app.user_id', true), ''));
DROP POLICY IF EXISTS "Session_identity_admin_read" ON "Session";
CREATE POLICY "Session_identity_admin_read" ON "Session" FOR SELECT
  USING ("aulia_identity_admin_for"("userId"));
DROP POLICY IF EXISTS "Session_identity_admin_update" ON "Session";
CREATE POLICY "Session_identity_admin_update" ON "Session" FOR UPDATE
  USING ("aulia_identity_admin_for"("userId"))
  WITH CHECK ("aulia_identity_admin_for"("userId"));
DROP POLICY IF EXISTS "Session_identity_maintenance_read" ON "Session";
CREATE POLICY "Session_identity_maintenance_read" ON "Session" FOR SELECT
  USING (coalesce(current_setting('app.user_role', true), '') = 'SECURITY_MAINTENANCE');
DROP POLICY IF EXISTS "Session_identity_maintenance_delete" ON "Session";
CREATE POLICY "Session_identity_maintenance_delete" ON "Session" FOR DELETE
  USING (coalesce(current_setting('app.user_role', true), '') = 'SECURITY_MAINTENANCE');

DROP POLICY IF EXISTS "SessionRefreshTokenHistory_identity_owner" ON "SessionRefreshTokenHistory";
CREATE POLICY "SessionRefreshTokenHistory_identity_owner" ON "SessionRefreshTokenHistory"
  USING (EXISTS (SELECT 1 FROM "Session" s WHERE s."id" = "sessionId" AND s."userId" = nullif(current_setting('app.user_id', true), '')))
  WITH CHECK (EXISTS (SELECT 1 FROM "Session" s WHERE s."id" = "sessionId" AND s."userId" = nullif(current_setting('app.user_id', true), '')));
DROP POLICY IF EXISTS "SessionRefreshTokenHistory_identity_maintenance_read" ON "SessionRefreshTokenHistory";
CREATE POLICY "SessionRefreshTokenHistory_identity_maintenance_read" ON "SessionRefreshTokenHistory" FOR SELECT
  USING (coalesce(current_setting('app.user_role', true), '') = 'SECURITY_MAINTENANCE');
DROP POLICY IF EXISTS "SessionRefreshTokenHistory_identity_maintenance" ON "SessionRefreshTokenHistory";
CREATE POLICY "SessionRefreshTokenHistory_identity_maintenance" ON "SessionRefreshTokenHistory" FOR DELETE
  USING (coalesce(current_setting('app.user_role', true), '') = 'SECURITY_MAINTENANCE');

DO $$
DECLARE
  target_table TEXT;
BEGIN
  FOREACH target_table IN ARRAY ARRAY['RefreshToken', 'PasswordHistory', 'PasswordResetToken'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', target_table || '_identity_owner', target_table);
    EXECUTE format('CREATE POLICY %I ON %I USING ("userId" = nullif(current_setting(''app.user_id'', true), '''')) WITH CHECK ("userId" = nullif(current_setting(''app.user_id'', true), ''''))',
      target_table || '_identity_owner', target_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', target_table || '_identity_maintenance', target_table);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE USING (coalesce(current_setting(''app.user_role'', true), '''') = ''SECURITY_MAINTENANCE'')',
      target_table || '_identity_maintenance', target_table);
  END LOOP;
END;
$$;

-- Reception/billing creates a portal activation token for a patient account.
-- Prisma's INSERT ... RETURNING also requires the matching scoped SELECT policy.
DROP POLICY IF EXISTS "PasswordResetToken_identity_staff_read" ON "PasswordResetToken";
CREATE POLICY "PasswordResetToken_identity_staff_read" ON "PasswordResetToken" FOR SELECT
  USING (coalesce(current_setting('app.user_role', true), '') NOT IN ('', 'PATIENT', 'AUTH_LOGIN')
         AND "aulia_identity_user_in_scope"("userId"));
DROP POLICY IF EXISTS "PasswordResetToken_identity_staff_insert" ON "PasswordResetToken";
CREATE POLICY "PasswordResetToken_identity_staff_insert" ON "PasswordResetToken" FOR INSERT
  WITH CHECK (coalesce(current_setting('app.user_role', true), '') NOT IN ('', 'PATIENT', 'AUTH_LOGIN')
              AND "aulia_identity_user_in_scope"("userId"));

DROP POLICY IF EXISTS "LoginAttempt_identity_read" ON "LoginAttempt";
CREATE POLICY "LoginAttempt_identity_read" ON "LoginAttempt" FOR SELECT USING (
  "userId" = nullif(current_setting('app.user_id', true), '')
  OR "aulia_identity_admin_for"("userId")
);
DROP POLICY IF EXISTS "LoginAttempt_auth_login_read" ON "LoginAttempt";
CREATE POLICY "LoginAttempt_auth_login_read" ON "LoginAttempt" FOR SELECT
  USING (coalesce(current_setting('app.user_role', true), '') = 'AUTH_LOGIN');
DROP POLICY IF EXISTS "LoginAttempt_identity_insert" ON "LoginAttempt";
CREATE POLICY "LoginAttempt_identity_insert" ON "LoginAttempt" FOR INSERT WITH CHECK (
  coalesce(current_setting('app.user_role', true), '') = 'AUTH_LOGIN'
  OR "userId" = nullif(current_setting('app.user_id', true), '')
);
DROP POLICY IF EXISTS "LoginAttempt_identity_maintenance_read" ON "LoginAttempt";
CREATE POLICY "LoginAttempt_identity_maintenance_read" ON "LoginAttempt" FOR SELECT
  USING (coalesce(current_setting('app.user_role', true), '') = 'SECURITY_MAINTENANCE');
DROP POLICY IF EXISTS "LoginAttempt_identity_maintenance" ON "LoginAttempt";
CREATE POLICY "LoginAttempt_identity_maintenance" ON "LoginAttempt" FOR DELETE
  USING (coalesce(current_setting('app.user_role', true), '') = 'SECURITY_MAINTENANCE');

DROP POLICY IF EXISTS "AuditTrail_identity_read" ON "AuditTrail";
CREATE POLICY "AuditTrail_identity_read" ON "AuditTrail" FOR SELECT USING (
  "actorId" = nullif(current_setting('app.user_id', true), '')
  OR "aulia_identity_admin_for"("actorId")
);
-- The holder may see which administrator revealed their temporary access code.
DROP POLICY IF EXISTS "AuditTrail_access_code_subject_read" ON "AuditTrail";
CREATE POLICY "AuditTrail_access_code_subject_read" ON "AuditTrail" FOR SELECT
  USING ("entity" = 'USER' AND "entityId" = nullif(current_setting('app.user_id', true), '')
         AND "after"->>'event' = 'ACCESS_CODE_REVEALED');
DROP POLICY IF EXISTS "AuditTrail_identity_insert" ON "AuditTrail";
CREATE POLICY "AuditTrail_identity_insert" ON "AuditTrail" FOR INSERT
  WITH CHECK ("actorId" = nullif(current_setting('app.user_id', true), ''));

-- Extend the existing startup guard: forgetting one of these tables now stops
-- the API just like forgetting a clinicId/patientId table.
CREATE OR REPLACE FUNCTION "aulia_unprotected_tenant_tables"()
RETURNS TABLE ("table_name" TEXT)
LANGUAGE sql
STABLE
AS $$
  SELECT c.relname::text
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  WHERE c.relkind = 'r'
    AND (
      EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname IN ('clinicId', 'patientId') AND NOT a.attisdropped)
      OR c.relname IN ('UserRole', 'RefreshToken', 'PasswordHistory', 'LoginAttempt', 'Session',
                       'SessionRefreshTokenHistory', 'PasswordResetToken', 'AuditTrail')
    )
    AND NOT (c.relrowsecurity AND c.relforcerowsecurity AND EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid))
    AND NOT EXISTS (SELECT 1 FROM "aulia_rls_exemption" e WHERE e."table_name" = c.relname)
  ORDER BY 1;
$$;
GRANT EXECUTE ON FUNCTION "aulia_unprotected_tenant_tables"() TO aulia_app;
