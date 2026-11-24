/**
 * Off-duty read-only mode, shared by the API client and the interface: after
 * a validated departure the session keeps reading but no longer writes.
 */
export type WorkMode = { readOnly: boolean; since?: string; until?: string };

let mode: WorkMode = { readOnly: false };
const listeners = new Set<() => void>();

export const getWorkMode = () => mode;
export function setWorkMode(next: WorkMode) {
  if (next.readOnly === mode.readOnly && next.since === mode.since) return;
  mode = next;
  document.documentElement.classList.toggle("aulia-readonly", next.readOnly);
  listeners.forEach((listener) => listener());
}
export function subscribeWorkMode(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Writes still possible off duty: signing in or out, the clock and the hand-over. */
const ALLOWED = [/^\/auth\//, /\/users\/me\/(clock-in|clock-out|shift-handover|work-mode)/];
export const isWriteBlocked = (endpoint: string, method: string) =>
  mode.readOnly && !["GET", "HEAD", "OPTIONS"].includes(method) && !ALLOWED.some((pattern) => pattern.test(endpoint.replace(/^https?:\/\/[^/]+/, "").replace(/^\/api/, "")));

export const OFF_DUTY_MESSAGE = "Votre poste est terminé : votre session est en lecture seule jusqu’à votre prochain poste.";
