import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../config/api";
import { timeLabel, type CareUnit, type CareUnitRole } from "../../api/careWorkflow";
import { Badge, Button, Dialog, Field, inputClass } from "./ui";

export type UnitProtocol = {
  code: "TRIAGE_SCALE" | "PARTOGRAM" | "SURGICAL_CHECKLIST"; label: string; clinicianRoles: string[]; content: unknown; defined: boolean; fingerprint: string;
  validation: null | { validatedByName: string; validatedByRole: string; validatedAt: string; comment: string | null };
};
const base = "/care-workflow/units";
export const fetchUnitProtocols = (unitId: string) => apiFetch<UnitProtocol[]>(`${base}/${unitId}/protocols`);
export const validateUnitProtocol = (unitId: string, body: { protocol: UnitProtocol["code"]; fingerprint: string; comment?: string }) =>
  apiFetch(`${base}/${unitId}/protocols/validate`, { method: "POST", body: JSON.stringify(body) });

const ROLE_LABELS: Record<string, string> = { PHYSICIAN: "médecin", SURGEON: "chirurgien", ANESTHESIOLOGIST: "anesthésiste", MIDWIFE: "sage-femme" };

/** Human reading of the protocol content, so the clinician validates what they actually read. */
function ProtocolContent({ protocol }: { protocol: UnitProtocol }) {
  if (!protocol.defined) return <p className="text-sm text-slate-500">Le protocole n’est pas encore défini par l’administration.</p>;
  if (protocol.code === "TRIAGE_SCALE") {
    const rows = (protocol.content as Array<{ code: string; label: string; priority?: string; maxWaitMinutes?: number; color?: string }>) ?? [];
    return (
      <table className="w-full text-sm"><thead className="text-xs uppercase text-slate-500"><tr><th className="p-1 text-left">Niveau</th><th className="p-1 text-left">Libellé</th><th className="p-1 text-left">Priorité</th><th className="p-1 text-left">Délai cible</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.code} className="border-t border-slate-100 dark:border-slate-800"><td className="p-1"><span className="mr-1 inline-block h-3 w-3 rounded-full align-middle" style={{ background: row.color ?? "#475569" }} />{row.code}</td><td className="p-1">{row.label}</td><td className="p-1">{row.priority ?? "—"}</td><td className="p-1">{row.maxWaitMinutes ?? "—"} min</td></tr>)}</tbody></table>
    );
  }
  if (protocol.code === "PARTOGRAM") {
    const p = (protocol.content ?? {}) as { alertLineFromCm?: number; alertRateCmPerHour?: number; actionLineOffsetHours?: number };
    return (
      <ul className="space-y-1 text-sm">
        <li>Ligne d’alerte : à partir de <strong>{p.alertLineFromCm ?? "—"} cm</strong>, progression attendue de <strong>{p.alertRateCmPerHour ?? "—"} cm/h</strong>.</li>
        <li>Ligne d’action : <strong>{p.actionLineOffsetHours ?? "—"} h</strong> à droite de la ligne d’alerte.</li>
      </ul>
    );
  }
  const phases = (protocol.content as Array<{ phase?: string; label?: string; items?: Array<string | { label?: string }> }>) ?? [];
  return (
    <div className="space-y-2 text-sm">{phases.map((phase, index) => (
      <div key={index}><p className="font-semibold">{phase.label ?? phase.phase}</p>
        <ul className="ml-4 list-disc">{(phase.items ?? []).map((item, i) => <li key={i}>{typeof item === "string" ? item : item.label}</li>)}</ul></div>
    ))}</div>
  );
}

/**
 * Banner and review dialog in the unit workspace: shows which protocols are
 * still the Aulia Care defaults, and lets a clinician leading the unit adopt
 * them for the establishment (the server checks role and content).
 */
export function ProtocolValidationBanner({ unit, unitRole, onValidated }: { unit: CareUnit; unitRole: CareUnitRole; onValidated: () => void }) {
  const [protocols, setProtocols] = useState<UnitProtocol[]>([]);
  const [open, setOpen] = useState<UnitProtocol | null>(null);
  const [comment, setComment] = useState("");
  const [confirm, setConfirm] = useState(false);
  const load = useCallback(() => { void fetchUnitProtocols(unit.id).then(setProtocols).catch(() => setProtocols([])); }, [unit.id]);
  useEffect(() => { load(); }, [load]);
  const pending = protocols.filter((item) => !item.validation);
  if (!protocols.length) return null;
  const submit = async () => {
    if (!open) return;
    try {
      await validateUnitProtocol(unit.id, { protocol: open.code, fingerprint: open.fingerprint, comment: comment.trim() || undefined });
      setOpen(null); setComment(""); setConfirm(false); load(); onValidated();
    } catch { /* reported globally (role, or protocol changed meanwhile) */ }
  };
  return (
    <>
      <div className={`mb-3 rounded-xl border p-3 text-sm ${pending.length ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200" : "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200"}`}>
        <ul className="space-y-1">{protocols.map((item) => (
          <li key={item.code} className="flex flex-wrap items-center justify-between gap-2">
            <span>
              <strong>{item.label}</strong> :{" "}
              {item.validation
                ? <>validé(e) par {item.validation.validatedByName} ({ROLE_LABELS[item.validation.validatedByRole] ?? item.validation.validatedByRole}) le {timeLabel(item.validation.validatedAt)}</>
                : <>réglage par défaut, <strong>non validé</strong> par l’équipe médicale de l’établissement. À valider par un responsable de l’unité ({item.clinicianRoles.map((r) => ROLE_LABELS[r] ?? r).join(", ")}).</>}
            </span>
            {!item.validation && item.defined && unitRole === "LEAD" && <Button small onClick={() => { setOpen(item); setConfirm(false); }}>Relire et valider</Button>}
            {item.validation && <Badge tone="green">Validé</Badge>}
          </li>
        ))}</ul>
      </div>
      {open && (
        <Dialog title={`Validation — ${open.label}`} onClose={() => setOpen(null)} wide>
          <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">Relisez le protocole tel qu’il sera appliqué dans l’unité. Votre validation l’adopte pour l’établissement, à votre nom ; toute modification ultérieure par l’administration la retirera.</p>
          <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800"><ProtocolContent protocol={open} /></div>
          <div className="mt-3"><Field label="Référence ou commentaire (protocole interne, date de la réunion…)"><input className={inputClass} value={comment} onChange={(e) => setComment(e.target.value)} /></Field></div>
          <label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} /> J’ai relu ce protocole : il est conforme à celui adopté par la direction médicale de l’établissement.</label>
          <div className="mt-4 flex justify-end gap-2"><Button tone="ghost" onClick={() => setOpen(null)}>Annuler</Button><Button disabled={!confirm} onClick={() => void submit()}>Valider pour l’établissement</Button></div>
        </Dialog>
      )}
    </>
  );
}
