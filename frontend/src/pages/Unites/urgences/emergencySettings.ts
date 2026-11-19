import type { CareEpisode, TriageLevel, UnitSettings } from "../../../api/careWorkflow";
import { minutesSince } from "../../../api/careWorkflow";

export const EMERGENCY_STAGES = { ARRIVAL: "ARRIVAL", WAITING: "WAITING", IN_CARE: "IN_CARE", DISPOSITION: "DISPOSITION" } as const;
export const STAGE_LABELS: Record<string, string> = { ARRIVAL: "À trier", WAITING: "Salle d’attente", IN_CARE: "En soins", DISPOSITION: "Orientation décidée" };

/**
 * Placeholder scale shown until the establishment configures and validates its
 * own triage protocol (Administration › Unités de soins). Aulia Care never
 * computes a level: the triage professional chooses it.
 */
export const DEFAULT_TRIAGE_SCALE: TriageLevel[] = [
  { code: "1", label: "Niveau 1 — immédiat", color: "#dc2626", priority: "STAT", maxWaitMinutes: 0 },
  { code: "2", label: "Niveau 2 — très urgent", color: "#ea580c", priority: "ASAP", maxWaitMinutes: 10 },
  { code: "3", label: "Niveau 3 — urgent", color: "#ca8a04", priority: "URGENT", maxWaitMinutes: 60 },
  { code: "4", label: "Niveau 4 — moins urgent", color: "#16a34a", priority: "ROUTINE", maxWaitMinutes: 120 },
  { code: "5", label: "Niveau 5 — non urgent", color: "#2563eb", priority: "ROUTINE", maxWaitMinutes: 240 },
];

export const ARRIVAL_MODES = [
  { code: "OWN_MEANS", label: "Moyens propres" },
  { code: "AMBULANCE", label: "Ambulance" },
  { code: "FIRE_POLICE", label: "Pompiers / police" },
  { code: "REFERRAL", label: "Référé par un autre établissement" },
  { code: "OTHER", label: "Autre" },
];

export const triageScale = (settings?: UnitSettings | null) => (settings?.triageScale?.length ? settings.triageScale : DEFAULT_TRIAGE_SCALE);
export const triageValidated = (settings?: UnitSettings | null) => Boolean(settings?.triageScale?.length && settings.triageScaleValidated);

/** Last triage level documented for a stay, kept on the client from the worklist events (stage + priority). */
export type TriageMemo = Record<string, { code: string; at: string }>;

export function waitingStatus(episode: CareEpisode, level: TriageLevel | undefined) {
  const waited = minutesSince(episode.startedAt ?? episode.createdAt);
  const limit = level?.maxWaitMinutes;
  return { waited, limit, overdue: limit !== undefined && waited > limit };
}
