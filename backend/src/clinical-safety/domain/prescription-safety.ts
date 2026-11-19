/**
 * Prescription safety - pure rules.
 *
 * Aulia Care ships no clinical knowledge here: allergies come from the patient
 * record and interaction rules from the establishment's validated rule set.
 * These functions only match what professionals recorded against what is being
 * prescribed, and say whether the prescriber must justify going ahead.
 */
export type AllergySeverity = 'MILD' | 'MODERATE' | 'SEVERE';
export type InteractionSeverity = 'MINOR' | 'MODERATE' | 'MAJOR' | 'CONTRAINDICATED';

export interface MedicationIdentity {
  id: string;
  name: string;
  activeSubstance?: string | null;
  atcCode?: string | null;
}

export interface AllergyRecord {
  id: string;
  substance: string;
  severity: AllergySeverity;
  reaction?: string | null;
}

export interface InteractionRuleRecord {
  id: string;
  substanceA: string;
  substanceB: string;
  severity: InteractionSeverity;
  effect: string;
  recommendation?: string | null;
  source: string;
}

export interface SafetyAlert {
  kind: 'ALLERGY' | 'INTERACTION';
  /** A blocking alert needs a written justification to prescribe anyway. */
  blocking: boolean;
  severity: string;
  message: string;
  medicationIds: string[];
  allergyId?: string;
  ruleId?: string;
  source?: string;
  recommendation?: string | null;
}

const ATC_PATTERN = /^[a-z]\d{2}[a-z0-9]{0,4}$/;
const MIN_TERM_LENGTH = 3;
const BLOCKING_INTERACTIONS: readonly InteractionSeverity[] = ['MAJOR', 'CONTRAINDICATED'];

/** Lower case, no accents, words separated by single spaces. */
export function normalizeTerm(value: string | null | undefined): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Whether a recorded substance designates this medication: an ATC code or
 * prefix (J01C covers every penicillin), or a whole-word match in the DCI or
 * the commercial name. Terms shorter than 3 characters never match.
 */
export function medicationMatches(medication: MedicationIdentity, substance: string): boolean {
  const term = normalizeTerm(substance);
  if (term.length < MIN_TERM_LENGTH) return false;
  const atc = normalizeTerm(medication.atcCode).replace(/ /g, '');
  if (ATC_PATTERN.test(term.replace(/ /g, '')) && atc) return atc.startsWith(term.replace(/ /g, ''));
  const haystacks = [medication.activeSubstance, medication.name].map(normalizeTerm).filter(Boolean);
  return haystacks.some((haystack) => ` ${haystack} `.includes(` ${term} `));
}

const ALLERGY_LABELS: Record<AllergySeverity, string> = { MILD: 'légère', MODERATE: 'modérée', SEVERE: 'sévère' };

/** Every documented, unresolved allergy that designates a prescribed medication (always blocking). */
export function allergyAlerts(allergies: readonly AllergyRecord[], prescribed: readonly MedicationIdentity[]): SafetyAlert[] {
  const alerts: SafetyAlert[] = [];
  for (const allergy of allergies) {
    const matching = prescribed.filter((medication) => medicationMatches(medication, allergy.substance));
    if (!matching.length) continue;
    alerts.push({
      kind: 'ALLERGY',
      blocking: true,
      severity: allergy.severity,
      allergyId: allergy.id,
      medicationIds: matching.map((medication) => medication.id),
      message: `Allergie documentée à « ${allergy.substance} » (${ALLERGY_LABELS[allergy.severity]}${allergy.reaction ? ` : ${allergy.reaction}` : ''}) — ${matching.map((medication) => medication.name).join(', ')}.`,
    });
  }
  return alerts;
}

/**
 * Validated interaction rules triggered between the prescribed medications, or
 * between a prescribed medication and a treatment in progress.
 */
export function interactionAlerts(
  rules: readonly InteractionRuleRecord[],
  prescribed: readonly MedicationIdentity[],
  current: readonly MedicationIdentity[],
): SafetyAlert[] {
  const alerts: SafetyAlert[] = [];
  const pairs: Array<[MedicationIdentity, MedicationIdentity]> = [];
  prescribed.forEach((first, index) => {
    prescribed.slice(index + 1).forEach((second) => pairs.push([first, second]));
    current.forEach((other) => pairs.push([first, other]));
  });
  const seen = new Set<string>();
  for (const rule of rules) {
    for (const [first, second] of pairs) {
      if (first.id === second.id) continue;
      const hit =
        (medicationMatches(first, rule.substanceA) && medicationMatches(second, rule.substanceB)) ||
        (medicationMatches(first, rule.substanceB) && medicationMatches(second, rule.substanceA));
      if (!hit) continue;
      const key = `${rule.id}:${[first.id, second.id].sort().join(':')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      alerts.push({
        kind: 'INTERACTION',
        blocking: BLOCKING_INTERACTIONS.includes(rule.severity),
        severity: rule.severity,
        ruleId: rule.id,
        source: rule.source,
        recommendation: rule.recommendation ?? null,
        medicationIds: [first.id, second.id],
        message: `Interaction ${rule.severity} entre ${first.name} et ${second.name} : ${rule.effect}`,
      });
    }
  }
  return alerts;
}

export function evaluatePrescriptionSafety(input: {
  allergies: readonly AllergyRecord[];
  rules: readonly InteractionRuleRecord[];
  prescribed: readonly MedicationIdentity[];
  current: readonly MedicationIdentity[];
}) {
  const alerts = [
    ...allergyAlerts(input.allergies, input.prescribed),
    ...interactionAlerts(input.rules, input.prescribed, input.current),
  ];
  return { alerts, blocking: alerts.some((alert) => alert.blocking) };
}

/** Stored form of a rule substance: normalised, ATC codes without spaces. */
export function canonicalSubstance(value: string): string {
  const term = normalizeTerm(value);
  const compact = term.replace(/ /g, '');
  return ATC_PATTERN.test(compact) ? compact : term;
}
