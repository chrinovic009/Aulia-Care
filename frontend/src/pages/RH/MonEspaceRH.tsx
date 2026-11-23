import { useCallback, useEffect, useState } from "react";
import { hrApi, type Colleague, type MySpace } from "../../api/hr";
import { Badge, Button, Card, dateTime, day, errorText, Field, inputClass, LEAVE_STATUS, Modal, money, monthLabel, Notice, PAY_STATE, REPLACEMENT_STATUS, Stat } from "./ui";

/**
 * Each employee's HR space: leave balance, leave requests and events
 * (bereavement, illness…), replacements asked by or of them, their lateness
 * of the month and their payslips.
 */
export default function MonEspaceRH() {
  const [space, setSpace] = useState<MySpace | null>(null);
  const [colleagues, setColleagues] = useState<Colleague[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | "leave" | "replacement">(null);
  const load = useCallback(() => {
    setError(null);
    hrApi.me().then(setSpace).catch((reason) => setError(errorText(reason, "Votre espace RH n’a pas pu être chargé.")));
  }, []);
  useEffect(() => { load(); hrApi.colleagues().then(setColleagues).catch(() => setColleagues([])); }, [load]);
  const act = async (work: () => Promise<unknown>, done: string) => {
    try { setError(null); await work(); setNotice(done); load(); } catch (reason) { setError(errorText(reason, "Action impossible.")); }
  };

  return (
    <section className="space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.16em] text-aulia-teal">Ressources humaines</p>
          <h1 className="text-2xl font-bold text-aulia-navy dark:text-white">Mon espace RH</h1>
          {space && <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{space.employee.name}{space.employee.position ? ` · ${space.employee.position}` : ""}{space.employee.hireDate ? ` · depuis le ${day(space.employee.hireDate)}` : ""}</p>}
        </div>
        {space && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setDialog("leave")}>Demander un congé / signaler un événement</Button>
            <Button tone="secondary" onClick={() => setDialog("replacement")}>Demander un remplacement</Button>
          </div>
        )}
      </header>
      {error && <Notice tone="error">{error}</Notice>}
      {notice && <Notice tone="success">{notice}</Notice>}
      {!space && !error && <p className="text-sm text-slate-500">Chargement…</p>}
      {space && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label={`Congé annuel restant ${space.balance.year}`} value={`${space.balance.remaining} j`} tone={space.balance.remaining <= 0 ? "border-amber-300" : ""} />
            <Stat label="Acquis / pris / en attente" value={`${space.balance.acquired} / ${space.balance.taken} / ${space.balance.pending} j`} />
            <Stat label={`Retards (${space.attendance ? monthLabel(space.attendance.month) : "ce mois"})`} value={space.attendance ? `${space.attendance.lateCount} · ${space.attendance.lateDuration}` : "—"} tone={space.attendance?.lateCount ? "border-amber-300" : ""} />
            <Stat label="Absences du mois" value={String(space.attendance?.absences.length ?? 0)} />
          </div>

          <Card title="Mes demandes de congé et événements">
            {space.leaves.length === 0 ? <p className="text-sm text-slate-500">Aucune demande.</p> : (
              <div className="overflow-x-auto"><table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-slate-500"><tr><th className="py-2">Motif</th><th>Période</th><th>Jours</th><th>État</th><th>Décision</th><th /></tr></thead>
                <tbody>{space.leaves.map((leave) => (
                  <tr key={leave.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="py-2"><span className="font-medium">{leave.typeLabel}</span>{leave.reason && <span className="block text-xs text-slate-500">{leave.reason}</span>}</td>
                    <td>{day(leave.startDate)} → {day(leave.endDate)}</td>
                    <td>{leave.days ?? "—"}{leave.deductsBalance ? " (solde)" : ""}</td>
                    <td><Badge tone={LEAVE_STATUS[leave.status]?.tone}>{LEAVE_STATUS[leave.status]?.label ?? leave.status}</Badge></td>
                    <td className="text-xs text-slate-500">{leave.decisionNote ?? (leave.decidedAt ? day(leave.decidedAt) : "")}</td>
                    <td className="text-right">{leave.status === "PENDING" && <Button small tone="secondary" onClick={() => act(() => hrApi.cancelLeave(leave.id), "Demande annulée.")}>Annuler</Button>}</td>
                  </tr>))}</tbody>
              </table></div>
            )}
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card title="On me demande de remplacer">
              {space.replacementsAskedOfMe.length === 0 ? <p className="text-sm text-slate-500">Aucune demande.</p> : space.replacementsAskedOfMe.map((row) => (
                <div key={row.id} className="mb-3 rounded-xl border border-slate-200 p-3 text-sm last:mb-0 dark:border-slate-800">
                  <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{row.colleague}</span><Badge tone={REPLACEMENT_STATUS[row.status]?.tone}>{REPLACEMENT_STATUS[row.status]?.label ?? row.status}</Badge></div>
                  <p className="text-slate-600 dark:text-slate-300">{dateTime(row.startAt)} → {dateTime(row.endAt)}</p>
                  {row.reason && <p className="text-xs text-slate-500">{row.reason}</p>}
                  {row.status === "PENDING_COLLEAGUE" && (
                    <div className="mt-2 flex gap-2">
                      <Button small onClick={() => act(() => hrApi.respondReplacement(row.id, true), "Vous avez accepté : l’administration doit valider.")}>Accepter</Button>
                      <Button small tone="secondary" onClick={() => { const note = window.prompt("Motif du refus (facultatif)") ?? undefined; void act(() => hrApi.respondReplacement(row.id, false, note), "Demande refusée."); }}>Refuser</Button>
                    </div>
                  )}
                </div>
              ))}
            </Card>
            <Card title="Mes demandes de remplacement">
              {space.replacementsAsked.length === 0 ? <p className="text-sm text-slate-500">Aucune demande.</p> : space.replacementsAsked.map((row) => (
                <div key={row.id} className="mb-3 rounded-xl border border-slate-200 p-3 text-sm last:mb-0 dark:border-slate-800">
                  <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">Par {row.colleague}</span><Badge tone={REPLACEMENT_STATUS[row.status]?.tone}>{REPLACEMENT_STATUS[row.status]?.label ?? row.status}</Badge></div>
                  <p className="text-slate-600 dark:text-slate-300">{dateTime(row.startAt)} → {dateTime(row.endAt)}</p>
                  {(row.colleagueNote || row.decisionNote) && <p className="text-xs text-slate-500">{row.decisionNote ?? row.colleagueNote}</p>}
                  {["PENDING_COLLEAGUE", "PENDING_ADMIN"].includes(row.status) && <div className="mt-2"><Button small tone="secondary" onClick={() => act(() => hrApi.cancelReplacement(row.id), "Demande annulée.")}>Annuler</Button></div>}
                </div>
              ))}
            </Card>
          </div>

          {space.attendance && (
            <Card title={`Mes retards et absences — ${monthLabel(space.attendance.month)}`}>
              {space.attendance.lateEntries.length === 0 && space.attendance.absences.length === 0 ? <p className="text-sm text-slate-500">Aucun retard ni absence ce mois-ci.</p> : (
                <ul className="space-y-1 text-sm">
                  {space.attendance.lateEntries.map((entry) => (
                    <li key={entry.attendanceId} className="flex flex-wrap justify-between gap-2"><span>{day(entry.date)} : prévu {dateTime(entry.plannedStartAt).split(" ")[1]}, arrivé {dateTime(entry.clockInAt).split(" ")[1]}</span><span className="font-semibold">{entry.duration} de retard{entry.justified ? " (justifié)" : ""}</span></li>
                  ))}
                  {space.attendance.absences.map((absence) => (
                    <li key={`a-${absence.date}`} className="flex flex-wrap justify-between gap-2"><span>{day(absence.date)} : absence</span><span className="font-semibold">{absence.justified ? "justifiée" : "non justifiée"}</span></li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          <Card title="Mes fiches de paie">
            {space.payslips.length === 0 ? <p className="text-sm text-slate-500">Aucune paie pour l’instant.</p> : (
              <div className="overflow-x-auto"><table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-slate-500"><tr><th className="py-2">Mois</th><th>Brut</th><th>Retenues et primes</th><th>Net</th><th>État</th></tr></thead>
                <tbody>{space.payslips.map((slip) => {
                  const lines = slip.appliedLines ?? slip.proposedLines;
                  return (
                    <tr key={slip.id} className="border-t border-slate-100 align-top dark:border-slate-800">
                      <td className="py-2 capitalize">{monthLabel(slip.month)}</td>
                      <td>{money(slip.gross, slip.currency)}</td>
                      <td className="text-xs">{lines.length === 0 ? "—" : lines.map((line, index) => <span key={index} className="block">{line.label} : {money(line.amount, slip.currency)}</span>)}{slip.state !== "PAID" && lines.length > 0 && <span className="block text-slate-500">(proposé, fixé au paiement)</span>}</td>
                      <td className="font-semibold">{money(slip.state === "PAID" ? slip.net : slip.proposedNet, slip.currency)}</td>
                      <td><Badge tone={PAY_STATE[slip.state].tone}>{PAY_STATE[slip.state].label}</Badge>{slip.paidAt && <span className="block text-xs text-slate-500">le {day(slip.paidAt)}</span>}</td>
                    </tr>
                  );
                })}</tbody>
              </table></div>
            )}
          </Card>
        </>
      )}
      {dialog === "leave" && space && <LeaveDialog space={space} colleagues={colleagues} onClose={() => setDialog(null)} onDone={(message) => { setDialog(null); setNotice(message); load(); }} />}
      {dialog === "replacement" && <ReplacementDialog colleagues={colleagues} onClose={() => setDialog(null)} onDone={(message) => { setDialog(null); setNotice(message); load(); }} />}
    </section>
  );
}

function LeaveDialog({ space, colleagues, onClose, onDone }: { space: MySpace; colleagues: Colleague[]; onClose: () => void; onDone: (message: string) => void }) {
  const [form, setForm] = useState({ type: "ANNUAL", startDate: "", endDate: "", reason: "", replacementEmployeeId: "" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const type = space.leaveTypes.find((item) => item.code === form.type);
  const submit = async () => {
    setSaving(true); setError(null);
    try {
      await hrApi.requestLeave({ type: form.type, startDate: form.startDate, endDate: form.endDate || form.startDate, reason: form.reason || undefined, replacementEmployeeId: form.replacementEmployeeId || undefined });
      onDone("Demande envoyée à l’administration.");
    } catch (reason) { setError(errorText(reason, "Demande impossible.")); } finally { setSaving(false); }
  };
  return (
    <Modal title="Demander un congé ou signaler un événement" onClose={onClose}>
      <Field label="Motif">
        <select className={inputClass} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
          {space.leaveTypes.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
        </select>
      </Field>
      {type?.deductsBalance && <Notice>Solde disponible : {space.balance.remaining} jour(s) ouvrable(s).</Notice>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Du"><input type="date" className={inputClass} value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></Field>
        <Field label="Au (inclus)"><input type="date" className={inputClass} value={form.endDate} min={form.startDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></Field>
      </div>
      <Field label={form.type === "ANNUAL" ? "Commentaire (facultatif)" : "Précisions (obligatoire)"} hint="Ex. : décès d’un proche, certificat médical, mariage…">
        <textarea className={inputClass} rows={3} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
      </Field>
      <Field label="Collègue proposé pour me remplacer (facultatif)" hint="Il devra accepter, puis l’administration validera.">
        <select className={inputClass} value={form.replacementEmployeeId} onChange={(e) => setForm({ ...form, replacementEmployeeId: e.target.value })}>
          <option value="">— Aucun —</option>
          {colleagues.map((colleague) => <option key={colleague.id} value={colleague.id}>{colleague.name}{colleague.position ? ` · ${colleague.position}` : ""}</option>)}
        </select>
      </Field>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex justify-end gap-2"><Button tone="secondary" onClick={onClose}>Annuler</Button><Button onClick={submit} disabled={saving || !form.startDate}>Envoyer la demande</Button></div>
    </Modal>
  );
}

function ReplacementDialog({ colleagues, onClose, onDone }: { colleagues: Colleague[]; onClose: () => void; onDone: (message: string) => void }) {
  const [form, setForm] = useState({ replacerId: "", startAt: "", endAt: "", reason: "" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    setSaving(true); setError(null);
    try {
      await hrApi.requestReplacement({ replacerId: form.replacerId, startAt: new Date(form.startAt).toISOString(), endAt: new Date(form.endAt).toISOString(), reason: form.reason });
      onDone("Demande envoyée à votre collègue.");
    } catch (reason) { setError(errorText(reason, "Demande impossible.")); } finally { setSaving(false); }
  };
  return (
    <Modal title="Demander un remplacement" onClose={onClose}>
      <Field label="Collègue">
        <select className={inputClass} value={form.replacerId} onChange={(e) => setForm({ ...form, replacerId: e.target.value })}>
          <option value="">— Choisir —</option>
          {colleagues.map((colleague) => <option key={colleague.id} value={colleague.id}>{colleague.name}{colleague.position ? ` · ${colleague.position}` : ""}</option>)}
        </select>
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Début"><input type="datetime-local" className={inputClass} value={form.startAt} onChange={(e) => setForm({ ...form, startAt: e.target.value })} /></Field>
        <Field label="Fin"><input type="datetime-local" className={inputClass} value={form.endAt} onChange={(e) => setForm({ ...form, endAt: e.target.value })} /></Field>
      </div>
      <Field label="Motif"><textarea className={inputClass} rows={3} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex justify-end gap-2"><Button tone="secondary" onClick={onClose}>Annuler</Button><Button onClick={submit} disabled={saving || !form.replacerId || !form.startAt || !form.endAt || !form.reason.trim()}>Envoyer</Button></div>
    </Modal>
  );
}
