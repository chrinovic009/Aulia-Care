import { useState } from "react";
import type { SafetyAlert } from "../../api/clinicalSafety";

const SEVERITY_LABELS: Record<string, string> = {
  MILD: "Allergie légère", MODERATE: "Allergie modérée", SEVERE: "Allergie sévère",
  MINOR: "Interaction mineure", CONTRAINDICATED: "Association contre-indiquée", MAJOR: "Interaction majeure",
};

/**
 * Shows the safety alerts raised for a prescription. A blocking alert needs a
 * written justification, which is kept with the prescription; the decision
 * always stays with the prescriber.
 */
export function PrescriptionSafetyDialog({
  alerts,
  onCancel,
  onConfirm,
}: {
  alerts: SafetyAlert[];
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const blocking = alerts.some((alert) => alert.blocking);
  const ready = !blocking || reason.trim().length >= 10;
  return (
    <div className="fixed inset-0 z-[100000] grid place-items-center overflow-y-auto bg-slate-950/60 p-4" role="alertdialog" aria-modal="true" aria-labelledby="rx-safety-title">
      <section className="w-full max-w-xl rounded-2xl border border-red-200 bg-white p-5 shadow-2xl dark:border-red-900 dark:bg-slate-950">
        <p className={`text-xs font-bold uppercase tracking-[.16em] ${blocking ? "text-red-600" : "text-amber-600"}`}>Sécurité de la prescription</p>
        <h2 id="rx-safety-title" className="mt-2 text-lg font-bold text-aulia-navy dark:text-white">
          {blocking ? "Alerte bloquante : justification requise" : "Points d’attention avant de prescrire"}
        </h2>
        <ul className="mt-4 space-y-3">
          {alerts.map((alert, index) => (
            <li key={index} className={`rounded-xl border p-3 text-sm ${alert.blocking ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200" : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100"}`}>
              <p className="text-xs font-bold uppercase">{SEVERITY_LABELS[alert.severity] || alert.severity}{alert.blocking ? " · bloquante" : ""}</p>
              <p className="mt-1">{alert.message}</p>
              {alert.recommendation && <p className="mt-1 text-xs">Conduite proposée par l’établissement : {alert.recommendation}</p>}
              {alert.source && <p className="mt-1 text-xs opacity-80">Source : {alert.source}</p>}
            </li>
          ))}
        </ul>
        <label className="mt-4 block text-sm">
          <span className="mb-1 block font-medium text-slate-700 dark:text-slate-200">
            {blocking ? "Justification clinique (obligatoire, conservée dans le dossier)" : "Commentaire (facultatif)"}
          </span>
          <textarea
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-aulia-teal dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Ex. bénéfice attendu supérieur au risque, surveillance prévue…"
          />
        </label>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 dark:border-slate-700 dark:text-slate-200">Modifier l’ordonnance</button>
          <button type="button" disabled={!ready} onClick={() => onConfirm(reason.trim())} className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">Prescrire malgré tout</button>
        </div>
      </section>
    </div>
  );
}
