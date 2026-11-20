export const draftKey = (id: string) => `aulia:server-draft:${id}`;

export function canPersistDraft(id: string, restoredKey: string | null, blocked: boolean) {
  return !blocked && (!id || restoredKey === draftKey(id));
}

export function draftDiagnosis(principal: string, hypotheses: string, description: string) {
  return { principal, hypotheses: hypotheses.split('\n').map(value => value.trim()).filter(Boolean), description };
}