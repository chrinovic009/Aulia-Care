-- Revision: a consultation may send the patient to the cashier.
-- Patient journey state machine enforced by the database, so that no API code
-- path can bypass PatientWorkflowService. Must stay identical to
-- ALLOWED_WORKFLOW_TRANSITIONS in src/core/patient-workflow.policy.ts
-- (checked by src/core/patient-workflow.migration.test.ts).
-- Statuses without a WHEN branch may move to any other status.
-- The guard applies to the restricted request role (aulia_app); migrations,
-- demo seeds and maintenance scripts run as the schema owner.
CREATE OR REPLACE FUNCTION patient_workflow_transition_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  allowed text[];
BEGIN
  IF current_user <> 'aulia_app' OR NEW."workflowStatus" IS NOT DISTINCT FROM OLD."workflowStatus" THEN
    RETURN NEW;
  END IF;
  allowed := CASE OLD."workflowStatus"::text
    WHEN 'EN_CONSULTATION' THEN ARRAY['EN_ATTENTE_DE_PAIEMENT', 'EN_ATTENTE_VALIDATION_CAISSE', 'EN_LABORATOIRE', 'EN_RADIOLOGIE', 'EN_PHARMACIE', 'HOSPITALISE', 'TERMINE', 'ANNULE']
    WHEN 'HOSPITALISE' THEN ARRAY['EN_CONSULTATION', 'EN_LABORATOIRE', 'EN_RADIOLOGIE', 'EN_PHARMACIE', 'TERMINE', 'ANNULE']
    WHEN 'TERMINE' THEN ARRAY['EN_ATTENTE_DE_PAIEMENT', 'EN_ATTENTE_VALIDATION_CAISSE', 'EN_ATTENTE_INFIRMERIE', 'EN_ATTENTE_MEDECIN', 'EN_CONSULTATION', 'HOSPITALISE']
    WHEN 'ANNULE' THEN ARRAY['EN_ATTENTE_DE_PAIEMENT', 'EN_ATTENTE_VALIDATION_CAISSE', 'EN_ATTENTE_INFIRMERIE', 'EN_ATTENTE_MEDECIN', 'EN_CONSULTATION', 'HOSPITALISE']
    ELSE NULL
  END;
  IF allowed IS NOT NULL AND NOT (NEW."workflowStatus"::text = ANY (allowed)) THEN
    RAISE EXCEPTION 'Transition de parcours patient interdite : % -> %', OLD."workflowStatus", NEW."workflowStatus"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS patient_workflow_transition_guard ON "Patient";
CREATE TRIGGER patient_workflow_transition_guard
BEFORE UPDATE OF "workflowStatus" ON "Patient"
FOR EACH ROW EXECUTE FUNCTION patient_workflow_transition_guard();
