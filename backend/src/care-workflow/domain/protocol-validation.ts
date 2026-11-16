import { createHash } from 'crypto';

/**
 * Clinical protocols an establishment must adopt before Aulia Care presents
 * them as its own: the emergency triage scale, the partogram alert and action
 * lines, the surgical safety checklist. Aulia Care ships defaults; only a
 * clinician leading the unit validates them. The validation is bound to the
 * exact content it approved (fingerprint): any later change by the
 * administration lifts it until the unit validates the new content.
 */
export type ProtocolCode = 'TRIAGE_SCALE' | 'PARTOGRAM' | 'SURGICAL_CHECKLIST';
type Settings = Record<string, unknown>;

export type ProtocolValidation = {
  fingerprint: string; validatedById: string; validatedByName: string; validatedByRole: string; validatedAt: string; comment: string | null;
};

const omitValidated = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const rest = { ...(value as Record<string, unknown>) };
  delete rest.validated;
  return rest;
};

export const PROTOCOLS: Record<ProtocolCode, {
  label: string; unitKind: string; clinicianRoles: string[];
  content: (settings: Settings) => unknown; flagged: (settings: Settings, validated: boolean) => Settings;
}> = {
  TRIAGE_SCALE: {
    label: 'Échelle de tri des urgences', unitKind: 'EMERGENCY', clinicianRoles: ['PHYSICIAN', 'SURGEON', 'ANESTHESIOLOGIST'],
    content: (settings) => settings.triageScale,
    flagged: (settings, validated) => ({ ...settings, triageScaleValidated: validated }),
  },
  PARTOGRAM: {
    label: 'Lignes d’alerte et d’action du partogramme', unitKind: 'MATERNITY', clinicianRoles: ['PHYSICIAN', 'SURGEON', 'MIDWIFE'],
    content: (settings) => omitValidated(settings.partogram),
    flagged: (settings, validated) => (settings.partogram && typeof settings.partogram === 'object'
      ? { ...settings, partogram: { ...(settings.partogram as Settings), validated } } : settings),
  },
  SURGICAL_CHECKLIST: {
    label: 'Check-list de sécurité au bloc opératoire', unitKind: 'SURGERY', clinicianRoles: ['SURGEON', 'ANESTHESIOLOGIST', 'PHYSICIAN'],
    content: (settings) => settings.checklist,
    flagged: (settings, validated) => ({ ...settings, checklistValidated: validated }),
  },
};

/** Key order does not change the fingerprint: only the clinical content does. */
const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value as Settings).sort().map((key) => [key, canonical((value as Settings)[key])]));
  }
  return value;
};
export const fingerprint = (content: unknown) => createHash('sha256').update(JSON.stringify(canonical(content ?? null))).digest('hex');

export const hasContent = (content: unknown) =>
  content !== undefined && content !== null && !(Array.isArray(content) && !content.length) && !(typeof content === 'object' && !Array.isArray(content) && !Object.keys(content as Settings).length);

export const protocolsOf = (unitKind: string) => (Object.keys(PROTOCOLS) as ProtocolCode[]).filter((code) => PROTOCOLS[code].unitKind === unitKind);

/**
 * Settings written by the administration: validation flags and records are
 * never taken from the input. They are recomputed from the validations already
 * on file, kept only while the validated content is unchanged.
 */
export function sealProtocolValidations(unitKind: string, previous: Settings | null | undefined, incoming: Settings): Settings {
  const rest = { ...incoming };
  delete rest.protocolValidations;
  const recorded = ((previous ?? {}).protocolValidations ?? {}) as Partial<Record<ProtocolCode, ProtocolValidation>>;
  let next: Settings = rest;
  const kept: Partial<Record<ProtocolCode, ProtocolValidation>> = {};
  for (const code of protocolsOf(unitKind)) {
    const protocol = PROTOCOLS[code];
    const validation = recorded[code];
    const content = protocol.content(next);
    const stillValid = Boolean(validation && hasContent(content) && validation.fingerprint === fingerprint(content));
    if (stillValid) kept[code] = validation;
    next = protocol.flagged(next, stillValid);
  }
  return Object.keys(kept).length ? { ...next, protocolValidations: kept } : next;
}

/** Settings after a clinician validated the protocol as currently written. */
export function withProtocolValidation(settings: Settings, code: ProtocolCode, validation: Omit<ProtocolValidation, 'fingerprint'>): Settings {
  const protocol = PROTOCOLS[code];
  const recorded = (settings.protocolValidations ?? {}) as Settings;
  return protocol.flagged({ ...settings, protocolValidations: { ...recorded, [code]: { ...validation, fingerprint: fingerprint(protocol.content(settings)) } } }, true);
}
