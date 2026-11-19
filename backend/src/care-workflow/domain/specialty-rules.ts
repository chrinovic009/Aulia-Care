import { WorkflowRuleError, eventsInForce, EventLike } from './workflow-rules';

export const SPECIALTY_STAGES: Record<string, readonly string[]> = {
  AMBULANCE: ['CALL', 'QUALIFIED', 'DISPATCHED', 'EN_ROUTE', 'ON_SCENE', 'PATIENT_CONTACT', 'TRANSPORT', 'AT_DESTINATION', 'HANDOVER', 'AVAILABLE'],
  DIALYSIS: ['ARRIVAL', 'PRE_WEIGHT', 'PRE_ASSESSMENT', 'ACCESS_CHECK', 'MACHINE_PREP', 'CONNECTION', 'START', 'MONITORING', 'END', 'DISCONNECTION', 'POST_ASSESSMENT', 'CLOSURE'],
  SURGERY: ['SCHEDULED', 'PREOP', 'IN_ROOM', 'ANESTHESIA', 'INCISION', 'CLOSURE', 'OUT_OF_ROOM', 'RECOVERY', 'POSTOP'],
};
const MEDICAL = ['PHYSICIAN', 'SURGEON', 'ANESTHESIOLOGIST'];
const MATERNITY = [...MEDICAL, 'MIDWIFE'];
const CARE = [...MATERNITY, 'NURSE', 'PARAMEDIC'];
export function assertEventProfession(role: string | null | undefined, type: string, payload?: Record<string, unknown> | null) {
  let allowed: readonly string[] | undefined;
  if (['DIALYSIS_PRESCRIPTION', 'SURGERY_SCHEDULED', 'ORIENTATION', 'DISCHARGE_AUTHORIZED', 'OPERATIVE_REPORT'].includes(type)) allowed = MEDICAL;
  else if (['DELIVERY', 'BIRTH', 'NEWBORN_REGISTERED', 'PREGNANCY_OPENED', 'PREGNANCY_UPDATED'].includes(type)) allowed = MATERNITY;
  else if (type === 'SURGERY_STEP' && payload?.stage === 'ANESTHESIA') allowed = ['PHYSICIAN', 'ANESTHESIOLOGIST'];
  else if (type === 'SURGERY_STEP' && ['INCISION', 'CLOSURE'].includes(String(payload?.stage))) allowed = ['PHYSICIAN', 'SURGEON'];
  else if (['TRIAGE', 'VITALS', 'CHECKLIST_ITEM', 'SURGERY_STEP', 'DIALYSIS_STEP', 'PRENATAL_VISIT', 'PARTOGRAM_ENTRY', 'POSTPARTUM_CHECK', 'NEWBORN_CARE', 'NEWBORN_ASSESSMENT', 'PREHOSPITAL_ASSESSMENT'].includes(type) || type.startsWith('DIALYSIS_')) allowed = CARE;
  else if (type === 'MISSION_STEP') allowed = [...CARE, 'DISPATCHER'];
  if (allowed && (!role || !allowed.includes(role))) throw new WorkflowRuleError('PROFESSION_NOT_ALLOWED', 'Votre profession ne permet pas de prescrire, réaliser ou valider cet acte.');
}
export function assertStageProgress(kind: string, from: string | null, to: string, stages?: readonly string[]) {
  if (!SPECIALTY_STAGES[kind]) return;
  const sequence = stages?.length ? stages : SPECIALTY_STAGES[kind];
  if (!sequence) return;
  const target = sequence.indexOf(to);
  if (target < 0) throw new WorkflowRuleError('UNKNOWN_STAGE', `Étape « ${to} » non prévue.`);
  const current = from ? sequence.indexOf(from) : -1;
  if (target !== current && target !== current + 1) throw new WorkflowRuleError('STAGE_PREREQUISITE_MISSING', 'Documentez l’étape précédente avant de poursuivre.');
}
export type SpecialtyEvent = EventLike & { payload?: unknown; occurredAt?: Date; recordedAt?: Date };
export function assertSpecialtyClosable(kind: string, settings: unknown, events: readonly SpecialtyEvent[]) {
  const effective = eventsInForce(events);
  if (kind === 'DIALYSIS') {
    const stages = new Set(effective.filter(e => e.type === 'DIALYSIS_STEP').map(e => (e.payload as { stage?: string } | null)?.stage));
    const missing = SPECIALTY_STAGES.DIALYSIS.filter(s => !['ARRIVAL', 'CLOSURE'].includes(s) && !stages.has(s));
    const types = new Set(effective.map(e => e.type));
    if (missing.length || ['DIALYSIS_PRE_ASSESSMENT', 'DIALYSIS_SESSION_PARAMETERS', 'DIALYSIS_POST_ASSESSMENT'].some(t => !types.has(t))) throw new WorkflowRuleError('MANDATORY_STEPS_MISSING', 'Séance incomplète : toutes les étapes et évaluations sont obligatoires.');
  }
  if (kind === 'AMBULANCE' && !effective.some(e => e.type === 'MISSION_STEP' && ['HANDOVER', 'AVAILABLE'].includes(String((e.payload as { stage?: string } | null)?.stage)))) throw new WorkflowRuleError('MANDATORY_STEPS_MISSING', 'La remise du patient doit être documentée avant la clôture.');
  if (kind === 'SURGERY') {
    const checklist = (settings as { checklist?: Array<{ phase: string; items: string[] }> } | null)?.checklist ?? [];
    const answers = new Map<string, string>();
    for (const event of effective) if (event.type === 'CHECKLIST_ITEM') {
      const p = event.payload as { phase?: string; item?: string; answer?: string } | null;
      answers.set(`${p?.phase}|${p?.item}`, p?.answer ?? '');
    }
    const safe = (answer?: string) => ['Fait', 'Oui', 'Non applicable'].includes(answer ?? '');
    if ([...answers.values()].some(a => !safe(a)) || checklist.some(p => p.items.some(i => !safe(answers.get(`${p.phase}|${i}`))))) throw new WorkflowRuleError('CHECKLIST_UNRESOLVED', 'Checklist incomplète ou problème de sécurité non résolu.');
  }
}
export function activeDialysisPrescription(payload: unknown) {
  return (payload as { status?: string } | null)?.status === 'En cours';
}
