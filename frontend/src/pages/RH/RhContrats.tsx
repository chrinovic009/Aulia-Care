import { useCallback, useEffect, useState } from "react";
import { hrApi, type Contract, type HrEmployee } from "../../api/hr";
import { Badge, Button, Card, CONTRACT_TYPES, day, errorText, Field, inputClass, Modal, money, Notice } from "./ui";

const ALERTS: Record<string, { label: string; tone: "red" | "amber" }> = {
  NO_CONTRACT: { label: "Sans contrat", tone: "red" }, NO_SALARY: { label: "Salaire non renseigné", tone: "amber" },
  EXPIRED: { label: "Contrat expiré", tone: "red" }, ENDING_SOON: { label: "Fin proche", tone: "amber" },
};
const today = () => new Date().toISOString().slice(0, 10);

/** Contracts and salaries. A salary can be changed at any time; paid months never change. */
export default function RhContrats() {
  const [data, setData] = useState<{ canEdit: boolean; employees: HrEmployee[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<null | { kind: "salary" | "contract" | "history"; employee: HrEmployee }>(null);
  const load = useCallback(() => { hrApi.employees().then(setData).catch((reason) => setError(errorText(reason, "Personnel indisponible."))); }, []);
  useEffect(() => { load(); }, [load]);
  const employees = (data?.employees ?? []).filter((employee) => !query || `${employee.name} ${employee.position ?? ""} ${employee.department ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  const done = (message: string) => { setDialog(null); setNotice(message); load(); };

  return (
    <div className="space-y-5">
      {error && <Notice tone="error">{error}</Notice>}
      {notice && <Notice tone="success">{notice}</Notice>}
      <Card title="Contrats et salaires" actions={<input className={`${inputClass} max-w-xs`} placeholder="Rechercher un employé" value={query} onChange={(e) => setQuery(e.target.value)} />}>
        {!data ? <p className="text-sm text-slate-500">Chargement…</p> : (
          <div className="overflow-x-auto"><table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500"><tr><th className="py-2">Employé</th><th>Contrat</th><th>Salaire mensuel</th><th>Période</th><th>Alerte</th><th /></tr></thead>
            <tbody>{employees.map((employee) => (
              <tr key={employee.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="py-2"><span className="font-medium">{employee.name}</span><span className="block text-xs text-slate-500">{[employee.position, employee.department].filter(Boolean).join(" · ")}</span></td>
                <td>{employee.contract ? CONTRACT_TYPES[employee.contract.type] ?? employee.contract.type : "—"}</td>
                <td className="font-semibold">{employee.contract?.salary != null ? money(employee.contract.salary, employee.contract.currency) : "—"}</td>
                <td className="text-xs">{employee.contract ? `${day(employee.contract.startDate)} → ${employee.contract.endDate ? day(employee.contract.endDate) : "indéterminée"}` : "—"}</td>
                <td>{employee.alert && <Badge tone={ALERTS[employee.alert].tone}>{ALERTS[employee.alert].label}{employee.alert === "ENDING_SOON" ? ` (${employee.contractEndsInDays} j)` : ""}</Badge>}</td>
                <td className="space-x-1 whitespace-nowrap text-right">
                  {data.canEdit && employee.contract && <Button small onClick={() => setDialog({ kind: "salary", employee })}>Salaire</Button>}
                  {data.canEdit && <Button small tone="secondary" onClick={() => setDialog({ kind: "contract", employee })}>{employee.contract ? "Nouveau contrat" : "Créer le contrat"}</Button>}
                  <Button small tone="secondary" onClick={() => setDialog({ kind: "history", employee })}>Historique</Button>
                </td>
              </tr>))}</tbody>
          </table></div>
        )}
      </Card>
      {dialog?.kind === "salary" && <SalaryDialog employee={dialog.employee} onClose={() => setDialog(null)} onDone={() => done("Salaire modifié. Les paies déjà payées ne changent pas ; recalculez les paies non payées.")} />}
      {dialog?.kind === "contract" && <ContractDialog employee={dialog.employee} onClose={() => setDialog(null)} onDone={() => done("Contrat enregistré.")} />}
      {dialog?.kind === "history" && <HistoryDialog employee={dialog.employee} canEdit={Boolean(data?.canEdit)} onClose={() => setDialog(null)} onChanged={() => { setNotice("Contrat mis à jour."); load(); }} />}
    </div>
  );
}

function SalaryDialog({ employee, onClose, onDone }: { employee: HrEmployee; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ salary: String(employee.contract?.salary ?? ""), effectiveDate: today(), reason: "" });
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    try { await hrApi.changeSalary(employee.id, { salary: Number(form.salary), effectiveDate: form.effectiveDate, reason: form.reason }); onDone(); } catch (reason) { setError(errorText(reason, "Modification impossible.")); }
  };
  return (
    <Modal title={`Salaire — ${employee.name}`} onClose={onClose}>
      <p className="text-sm text-slate-600 dark:text-slate-300">Salaire actuel : <strong>{employee.contract?.salary != null ? money(employee.contract.salary, employee.contract.currency) : "—"}</strong></p>
      <Field label={`Nouveau salaire mensuel (${employee.contract?.currency ?? "CDF"})`}><input type="number" min="0" step="0.01" className={inputClass} value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} /></Field>
      <Field label="Applicable à partir du" hint="Le mois en cours est calculé au prorata des deux salaires."><input type="date" className={inputClass} value={form.effectiveDate} onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })} /></Field>
      <Field label="Motif"><input className={inputClass} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Promotion, révision annuelle…" /></Field>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex justify-end gap-2"><Button tone="secondary" onClick={onClose}>Annuler</Button><Button onClick={submit} disabled={!form.salary || !form.reason.trim()}>Enregistrer</Button></div>
    </Modal>
  );
}

function ContractDialog({ employee, onClose, onDone }: { employee: HrEmployee; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ type: "PERMANENT", startDate: today(), endDate: "", salary: String(employee.contract?.salary ?? ""), currency: employee.contract?.currency ?? "CDF", reason: employee.contract ? "Renouvellement" : "Embauche" });
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    try { await hrApi.createContract(employee.id, { type: form.type, startDate: form.startDate, endDate: form.endDate || null, salary: Number(form.salary), currency: form.currency, reason: form.reason }); onDone(); } catch (reason) { setError(errorText(reason, "Contrat impossible.")); }
  };
  return (
    <Modal title={`Contrat — ${employee.name}`} onClose={onClose}>
      {employee.contract && <Notice>Le contrat en cours se terminera la veille du nouveau.</Notice>}
      <Field label="Type"><select className={inputClass} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{Object.entries(CONTRACT_TYPES).map(([type, label]) => <option key={type} value={type}>{label}</option>)}</select></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Début"><input type="date" className={inputClass} value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></Field>
        <Field label={form.type === "PERMANENT" ? "Fin (facultatif)" : "Fin"}><input type="date" className={inputClass} value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
        <Field label="Salaire mensuel"><input type="number" min="0" step="0.01" className={inputClass} value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} /></Field>
        <Field label="Devise"><select className={inputClass} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}><option>CDF</option><option>USD</option></select></Field>
      </div>
      <Field label="Motif"><input className={inputClass} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex justify-end gap-2"><Button tone="secondary" onClick={onClose}>Annuler</Button><Button onClick={submit} disabled={!form.salary || !form.startDate}>Enregistrer</Button></div>
    </Modal>
  );
}

function HistoryDialog({ employee, canEdit, onClose, onChanged }: { employee: HrEmployee; canEdit: boolean; onClose: () => void; onChanged: () => void }) {
  const [rows, setRows] = useState<Contract[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => { hrApi.contracts(employee.id).then(setRows).catch((reason) => setError(errorText(reason, "Historique indisponible."))); }, [employee.id]);
  useEffect(() => { load(); }, [load]);
  const end = async (contract: Contract) => {
    const value = window.prompt("Date de fin du contrat (AAAA-MM-JJ)", today());
    if (!value) return;
    try { await hrApi.updateContract(contract.id, { endDate: value }); load(); onChanged(); } catch (reason) { setError(errorText(reason, "Mise à jour impossible.")); }
  };
  return (
    <Modal title={`Historique — ${employee.name}`} onClose={onClose} wide>
      {error && <Notice tone="error">{error}</Notice>}
      {!rows ? <p className="text-sm text-slate-500">Chargement…</p> : rows.length === 0 ? <p className="text-sm text-slate-500">Aucun contrat.</p> : (
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-slate-500"><tr><th className="py-2">Période</th><th>Type</th><th>Salaire</th><th>Motif</th><th /></tr></thead>
          <tbody>{rows.map((row) => (
            <tr key={row.id} className="border-t border-slate-100 dark:border-slate-800">
              <td className="py-2">{day(row.startDate)} → {row.endDate ? day(row.endDate) : "en cours"}{row.active && <Badge tone="teal">actif</Badge>}</td>
              <td>{CONTRACT_TYPES[row.type] ?? row.type}</td>
              <td>{row.salary != null ? money(row.salary, row.currency) : "—"}</td>
              <td className="text-xs text-slate-500">{row.reason}</td>
              <td className="text-right">{canEdit && row.active && <Button small tone="secondary" onClick={() => end(row)}>Fixer la fin</Button>}</td>
            </tr>))}</tbody>
        </table>
      )}
    </Modal>
  );
}
