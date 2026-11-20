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
    jsonb_strip_nulls(jsonb_build_object('route', nullif(current_setting('app.route', true), ''), 'roles', coalesce(nullif(current_setting('app.user_roles', true), ''), '[]')::jsonb))
  );
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
