import { useCallback, useEffect, useMemo, useState } from "react";
import { currentMonth, hrApi, type Payroll, type PayrollLine, type PayrollMonth, type PayrollOverview } from "../../api/hr";
import { Badge, Button, Card, day, errorText, Field, inputClass, Modal, money, monthLabel, Notice, PAY_STATE, Stat } from "./ui";

const LINE_KINDS: Record<PayrollLine["kind"], string> = { LATE: "Retenue retards", ABSENCE: "Retenue absences", UNPAID_LEAVE: "Congé sans solde", ADVANCE: "Avance sur salaire", BONUS: "Prime", OTHER: "Autre (+/−)" };

/** Monthly payroll: managed by finance, read by the administration and the super administration. */
export default function RhPaie() {
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState<PayrollMonth | null>(null);
  const [overview, setOverview] = useState<PayrollOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [paying, setPaying] = useState<Payroll | null>(null);
  const load = useCallback(() => {
    setError(null);
    hrApi.payroll(month).then(setData).catch((reason) => setError(errorText(reason, "Paie indisponible.")));
    hrApi.payrollOverview().then(setOverview).catch(() => setOverview(null));
  }, [month]);
  useEffect(() => { load(); }, [load]);
  const run = async (work: () => Promise<unknown>, message: string) => {
    try { setError(null); await work(); setNotice(message); load(); } catch (reason) { setError(errorText(reason, "Action impossible.")); }
  };
  const currency = data?.currency ?? "CDF";

  return (
    <div className="space-y-5">
      {overview && overview.totals.late > 0 && (
        <Notice tone="error">{overview.totals.late} paie(s) en retard, tous mois confondus ({money(overview.totals.lateAmount, currency)}) : {overview.late.slice(0, 6).map((row) => `${row.employee.name} (${monthLabel(row.month)}, ${row.daysLate} j)`).join(", ")}{overview.late.length > 6 ? "…" : ""}.</Notice>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Mois"><input type="month" className={inputClass} value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} /></Field>
        {data?.canManage && <Button onClick={() => run(() => hrApi.generatePayroll(month), "Paie du mois calculée (les paies déjà payées ne changent pas).")}>{data.payrolls.length ? "Recalculer les paies non payées" : "Calculer la paie du mois"}</Button>}
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {notice && <Notice tone="success">{notice}</Notice>}
      {data && (
        <>
          {data.missing > 0 && <Notice>{data.missing} employé(s) salarié(s) n’ont pas encore de paie pour {monthLabel(month)}{data.canManage ? " : lancez le calcul." : "."}</Notice>}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Stat label="Masse salariale brute" value={money(data.totals.gross, currency)} />
            <Stat label="Payé" value={money(data.totals.paid, currency)} />
            <Stat label="Reste à payer (proposé)" value={money(data.totals.toPay, currency)} />
            <Stat label="Non payées" value={String(data.totals.unpaid)} tone={data.totals.unpaid ? "border-amber-300" : ""} />
            <Stat label="En retard" value={String(data.totals.late)} tone={data.totals.late ? "border-red-300" : ""} />
          </div>
          <Card title={`Paie — ${monthLabel(month)}`}>
            {data.payrolls.length === 0 ? <p className="text-sm text-slate-500">Aucune paie calculée pour ce mois.</p> : (
              <div className="overflow-x-auto"><table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-slate-500"><tr><th className="py-2">Employé</th><th>Salaire / brut</th><th>Retenues et primes</th><th>Net</th><th>Échéance</th><th>État</th><th /></tr></thead>
                <tbody>{data.payrolls.map((row) => {
                  const lines = row.appliedLines ?? row.proposedLines;
                  return (
                    <tr key={row.id} className="border-t border-slate-100 align-top dark:border-slate-800">
                      <td className="py-2"><span className="font-medium">{row.employee.name}</span><span className="block text-xs text-slate-500">{[row.employee.position, row.employee.department].filter(Boolean).join(" · ")}</span></td>
                      <td>{row.baseSalary !== null && <span className="block text-xs text-slate-500">{money(row.baseSalary, row.currency)} / mois</span>}{money(row.gross, row.currency)}{row.facts?.coveredDays && row.facts.daysInMonth && row.facts.coveredDays < row.facts.daysInMonth ? <span className="block text-xs text-slate-500">{row.facts.coveredDays}/{row.facts.daysInMonth} j</span> : null}</td>
                      <td className="text-xs">{lines.length === 0 ? "—" : lines.map((line, index) => <span key={index} className="block">{line.label} : <strong>{money(line.amount, row.currency)}</strong></span>)}{row.state !== "PAID" && lines.length > 0 && <span className="block text-slate-500">proposé</span>}{row.notes && <span className="block italic text-slate-500">{row.notes}</span>}</td>
                      <td className="font-semibold">{money(row.state === "PAID" ? row.net : row.proposedNet, row.currency)}</td>
                      <td>{day(row.dueDate)}</td>
                      <td><Badge tone={PAY_STATE[row.state].tone}>{PAY_STATE[row.state].label}{row.state === "LATE" ? ` · ${row.daysLate} j` : ""}</Badge>{row.paidAt && <span className="block text-xs text-slate-500">le {day(row.paidAt)}{row.paymentMethod ? ` · ${row.paymentMethod}` : ""}</span>}</td>
                      <td className="space-y-1 text-right">
                        {data.canManage && row.state !== "PAID" && (
                          <>
                            <Button small onClick={() => setPaying(row)}>Payer</Button>
                            <div><Button small tone="secondary" onClick={() => run(() => hrApi.recomputePayroll(row.id), "Paie recalculée.")}>Recalculer</Button></div>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}</tbody>
              </table></div>
            )}
          </Card>
        </>
      )}
      {paying && <PayDialog payroll={paying} onClose={() => setPaying(null)} onDone={() => { setPaying(null); setNotice("Paie enregistrée comme payée."); load(); }} />}
    </div>
  );
}

function PayDialog({ payroll, onClose, onDone }: { payroll: Payroll; onClose: () => void; onDone: () => void }) {
  const [lines, setLines] = useState<PayrollLine[]>(payroll.proposedLines.map((line) => ({ ...line })));
  const [form, setForm] = useState({ paymentMethod: "Virement", paymentReference: "", notes: "" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const signed = (line: PayrollLine) => (["LATE", "ABSENCE", "UNPAID_LEAVE", "ADVANCE"].includes(line.kind) ? -Math.abs(line.amount) : line.kind === "BONUS" ? Math.abs(line.amount) : line.amount);
  const net = useMemo(() => Math.round((payroll.gross + lines.reduce((sum, line) => sum + signed(line), 0)) * 100) / 100, [lines, payroll.gross]);
  const changed = JSON.stringify(payroll.proposedLines.map((line) => [line.kind, line.amount])) !== JSON.stringify(lines.map((line) => [line.kind, signed(line)]));
  const update = (index: number, patch: Partial<PayrollLine>) => setLines((current) => current.map((line, at) => (at === index ? { ...line, ...patch } : line)));
  const submit = async () => {
    setSaving(true); setError(null);
    try {
      await hrApi.payPayroll(payroll.id, { version: payroll.version, lines: lines.map((line) => ({ ...line, amount: signed(line) })), ...form });
      onDone();
    } catch (reason) { setError(errorText(reason, "Paiement impossible.")); } finally { setSaving(false); }
  };
  return (
    <Modal title={`Payer ${payroll.employee.name} — ${monthLabel(payroll.month)}`} onClose={onClose} wide>
      <Notice>Les retenues proposées par Aulia (retards, absences) peuvent être gardées, modifiées ou retirées, et des primes ou avances ajoutées. Ces ajustements ne valent que pour ce mois ; le salaire, lui, se modifie dans Contrats & salaires.</Notice>
      <p className="text-sm">Brut du mois : <strong>{money(payroll.gross, payroll.currency)}</strong></p>
      <div className="space-y-2">
        {lines.map((line, index) => (
          <div key={index} className="grid items-end gap-2 sm:grid-cols-[180px_1fr_140px_auto]">
            <select className={inputClass} value={line.kind} onChange={(e) => update(index, { kind: e.target.value as PayrollLine["kind"] })}>{Object.entries(LINE_KINDS).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}</select>
            <input className={inputClass} value={line.label} onChange={(e) => update(index, { label: e.target.value })} placeholder="Libellé" />
            <input className={inputClass} type="number" step="0.01" value={Math.abs(line.amount)} onChange={(e) => update(index, { amount: Number(e.target.value) })} />
            <Button small tone="secondary" onClick={() => setLines((current) => current.filter((_, at) => at !== index))}>Retirer</Button>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button small tone="secondary" onClick={() => setLines((current) => [...current, { kind: "BONUS", label: "Prime", amount: 0 }])}>+ Prime</Button>
          <Button small tone="secondary" onClick={() => setLines((current) => [...current, { kind: "ADVANCE", label: "Avance sur salaire", amount: 0 }])}>+ Avance</Button>
          <Button small tone="secondary" onClick={() => setLines((current) => [...current, { kind: "LATE", label: "Retenue retards", amount: 0 }])}>+ Retenue</Button>
        </div>
      </div>
      <p className="text-lg">Net à payer : <strong className={net < 0 ? "text-red-600" : ""}>{money(net, payroll.currency)}</strong></p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Mode de paiement"><select className={inputClass} value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>{["Virement", "Espèces", "Mobile money", "Chèque"].map((method) => <option key={method}>{method}</option>)}</select></Field>
        <Field label="Référence (facultatif)"><input className={inputClass} value={form.paymentReference} onChange={(e) => setForm({ ...form, paymentReference: e.target.value })} /></Field>
      </div>
      <Field label={changed ? "Raison de l’ajustement (obligatoire)" : "Note (facultatif)"}><textarea className={inputClass} rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex justify-end gap-2"><Button tone="secondary" onClick={onClose}>Annuler</Button><Button onClick={submit} disabled={saving || net < 0 || (changed && !form.notes.trim())}>Confirmer le paiement</Button></div>
    </Modal>
  );
}
