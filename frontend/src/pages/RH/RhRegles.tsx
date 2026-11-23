import { useEffect, useState } from "react";
import { hrApi, type HrPolicy } from "../../api/hr";
import { Button, Card, errorText, Field, inputClass, Notice } from "./ui";

const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

/** HR rules of the establishment: pay date, lateness tolerance, deduction bases and leave entitlement. */
export default function RhRegles() {
  const [policy, setPolicy] = useState<HrPolicy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => { hrApi.policy().then(setPolicy).catch((reason) => setError(errorText(reason, "Règles indisponibles."))); }, []);
  if (!policy) return error ? <Notice tone="error">{error}</Notice> : <p className="text-sm text-slate-500">Chargement…</p>;
  const set = (patch: Partial<HrPolicy>) => setPolicy({ ...policy, ...patch });
  const number = (key: keyof HrPolicy, label: string, hint: string, step = "1") => (
    <Field label={label} hint={hint}><input type="number" step={step} className={inputClass} disabled={!policy.canEdit} value={String(policy[key])} onChange={(e) => set({ [key]: Number(e.target.value) } as Partial<HrPolicy>)} /></Field>
  );
  const save = async () => {
    try { const { canEdit: _canEdit, ...body } = policy; setPolicy(await hrApi.savePolicy(body)); setNotice("Règles enregistrées."); setError(null); } catch (reason) { setError(errorText(reason, "Enregistrement impossible.")); }
  };
  return (
    <Card title="Règles RH de l’établissement">
      <div className="grid gap-4 md:grid-cols-2">
        {number("payDay", "Jour de paie", "Jour du mois suivant où la paie est due ; au-delà, elle est en retard.")}
        {number("lateGraceMinutes", "Tolérance de retard (minutes)", "En deçà, l’arrivée n’est pas comptée en retard.")}
        {number("monthlyWorkingHours", "Heures de travail par mois", "Base du taux horaire des retenues pour retard.", "0.5")}
        {number("workingDaysPerMonth", "Jours de travail par mois", "Base du taux journalier des retenues pour absence.")}
        {number("leaveDaysPerMonth", "Congé acquis par mois de service (jours)", "Code du travail (RDC) : au moins 1 jour ouvrable par mois.", "0.5")}
        {number("seniorityBonusYears", "Ancienneté pour 1 jour de congé en plus (années)", "0 pour désactiver.")}
      </div>
      <div className="mt-4">
        <p className="mb-1 text-sm font-medium text-slate-600 dark:text-slate-300">Jours travaillés (horaire de jour permanent)</p>
        <div className="flex flex-wrap gap-2">{DAYS.map((label, index) => {
          const value = index + 1;
          const on = policy.workWeekDays.includes(value);
          return <button key={label} type="button" disabled={!policy.canEdit} onClick={() => set({ workWeekDays: on ? policy.workWeekDays.filter((dayValue) => dayValue !== value) : [...policy.workWeekDays, value].sort() })} className={`rounded-lg px-3 py-1.5 text-sm ${on ? "bg-aulia-teal text-white" : "border border-slate-300 text-slate-600"}`}>{label}</button>;
        })}</div>
      </div>
      {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}
      {notice && <div className="mt-4"><Notice tone="success">{notice}</Notice></div>}
      {policy.canEdit && <div className="mt-4 flex justify-end"><Button onClick={save}>Enregistrer</Button></div>}
    </Card>
  );
}
