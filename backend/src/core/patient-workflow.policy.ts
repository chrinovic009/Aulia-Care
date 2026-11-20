import { PatientWorkflowStatus as S } from '@prisma/client';

/**
 * Global journey projection, not medical authorization. Domain services must
 * validate care, discharge and payment prerequisites before calling Core.
 * Every status change goes through
 * `decideWorkflowTransition`; a pair that is not listed here is refused.
 * The same table is enforced by the `patient_workflow_transition_guard`
 * database trigger (aulia_app role), so both lists must change together.
 */
const WAITING = [S.EN_ATTENTE_DE_PAIEMENT, S.EN_ATTENTE_VALIDATION_CAISSE, S.EN_ATTENTE_INFIRMERIE, S.EN_ATTENTE_MEDECIN] as const;
const TECHNICAL = [S.EN_LABORATOIRE, S.EN_RADIOLOGIE, S.EN_PHARMACIE] as const;

export const ALLOWED_WORKFLOW_TRANSITIONS: Readonly<Record<S, ReadonlySet<S>>> = {
  [S.EN_ATTENTE_DE_PAIEMENT]: new Set([...WAITING, S.EN_CONSULTATION, ...TECHNICAL, S.HOSPITALISE, S.TERMINE, S.ANNULE]),
  [S.EN_ATTENTE_VALIDATION_CAISSE]: new Set([...WAITING, S.EN_CONSULTATION, ...TECHNICAL, S.HOSPITALISE, S.TERMINE, S.ANNULE]),
  [S.EN_ATTENTE_INFIRMERIE]: new Set([...WAITING, S.EN_CONSULTATION, ...TECHNICAL, S.HOSPITALISE, S.TERMINE, S.ANNULE]),
  [S.EN_ATTENTE_MEDECIN]: new Set([...WAITING, S.EN_CONSULTATION, ...TECHNICAL, S.HOSPITALISE, S.TERMINE, S.ANNULE]),
  // A consultation never falls back to the nurse or physician queue, but it
  // may send the patient to the cashier for prescribed exams or medicines.
  [S.EN_CONSULTATION]: new Set([S.EN_ATTENTE_DE_PAIEMENT, S.EN_ATTENTE_VALIDATION_CAISSE, ...TECHNICAL, S.HOSPITALISE, S.TERMINE, S.ANNULE]),
  // Technical services may send the patient back to payment or to the physician.
  [S.EN_LABORATOIRE]: new Set([...WAITING, S.EN_CONSULTATION, ...TECHNICAL, S.HOSPITALISE, S.TERMINE, S.ANNULE]),
  [S.EN_RADIOLOGIE]: new Set([...WAITING, S.EN_CONSULTATION, ...TECHNICAL, S.HOSPITALISE, S.TERMINE, S.ANNULE]),
  [S.EN_PHARMACIE]: new Set([...WAITING, S.EN_CONSULTATION, ...TECHNICAL, S.HOSPITALISE, S.TERMINE, S.ANNULE]),
  // A hospitalized patient never falls back to a waiting queue.
  [S.HOSPITALISE]: new Set([S.EN_CONSULTATION, ...TECHNICAL, S.TERMINE, S.ANNULE]),
  // Closed journeys may reopen via reception, physician or admission services;
  // technical services cannot reopen a journey without a new encounter.
  [S.TERMINE]: new Set([...WAITING, S.EN_CONSULTATION, S.HOSPITALISE]),
  [S.ANNULE]: new Set([...WAITING, S.EN_CONSULTATION, S.HOSPITALISE]),
};

export type WorkflowDecision =
  | { outcome: 'unchanged'; status: S }
  | { outcome: 'applied'; status: S; previous: S }
  | { outcome: 'blocked'; status: S; requested: S };

export function decideWorkflowTransition(current: S, requested: S): WorkflowDecision {
  if (current === requested) return { outcome: 'unchanged', status: current };
  if (ALLOWED_WORKFLOW_TRANSITIONS[current].has(requested)) {
    return { outcome: 'applied', status: requested, previous: current };
  }
  return { outcome: 'blocked', status: current, requested };
}
