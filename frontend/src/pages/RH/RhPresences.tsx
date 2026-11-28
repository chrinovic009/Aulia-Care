import { Fragment, useCallback, useEffect, useState } from "react";
import { currentMonth, hrApi, type AttendanceReport, type HrEmployee } from "../../api/hr";
import { Badge, Button, Card, dateTime, day, errorText, Field, inputClass, Modal, monthLabel, Notice, Stat } from "./ui";

const time = (value: string) => new Date(value).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

/** Attendance and schedules: lateness (in hours and minutes beyond 60 min), absences and leave. */
export default function RhPresences() {
  const [month, setMonth] = useState(currentMonth());
  const [report, setReport] = useState<AttendanceReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [absenceDialog, setAbsenceDialog] = useState(false);
  const load = useCallback(() => { setError(null); hrApi.attendance(month).then(setReport).catch((reason) => setError(errorText(reason, "Présences indisponibles."))); }, [month]);
  useEffect(() => { load(); }, [load]);
  const justify = async (attendanceId: string, justified: boolean) => {
    const note = justified ? window.prompt("Justification (certificat, autorisation…)") : undefined;
    if (justified && !note) return;
    try { await hrApi.justify(attendanceId, justified, note ?? undefined); setNotice(justified ? "Justifié : ne sera pas retenu sur la paie." : "Justification retirée."); load(); } catch (reason) { setError(errorText(reason, "Action impossible.")); }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Mois"><input type="month" className={inputClass} value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} /></Field>
        {report?.canEdit && <Button tone="secondary" onClick={() => setAbsenceDialog(true)}>Enregistrer une absence</Button>}
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {notice && <Notice tone="success">{notice}</Notice>}
      {report && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Retards cumulés" value={`${report.totals.lateCount} · ${report.totals.lateDuration}`} tone={report.totals.lateCount ? "border-amber-300" : ""} />
            <Stat label="Absences non justifiées" value={String(report.totals.absentDays)} tone={report.totals.absentDays ? "border-red-300" : ""} />
            <Stat label="Mois" value={monthLabel(month)} />
          </div>
          {report.biggestLate.length > 0 && (
            <Card title="Retards les plus importants">
              <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
                {report.biggestLate.slice(0, 10).map((entry) => (
                  <li key={entry.attendanceId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span><span className="font-medium">{entry.employee}</span> · {day(entry.date)} · prévu {time(entry.plannedStartAt)}, arrivé {time(entry.clockInAt)}</span>
                    <span className="flex items-center gap-2"><strong className={entry.minutes >= 60 ? "text-red-600" : "text-amber-700"}>{entry.duration}</strong>{entry.justified && <Badge tone="green">justifié</Badge>}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card title="Par employé">
            <div className="overflow-x-auto"><table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-500"><tr><th className="py-2">Employé</th><th>Postes présents / prévus</th><th>Retards</th><th>Plus long</th><th>Absences</th><th>Congés</th><th /></tr></thead>
              <tbody>{report.rows.map((row) => (
                <Fragment key={row.employee.id}>
                  <tr className="border-t border-slate-100 dark:border-slate-800">
                    <td className="py-2"><span className="font-medium">{row.employee.name}</span><span className="block text-xs text-slate-500">{[row.employee.position, row.employee.department].filter(Boolean).join(" · ")}</span></td>
                    <td>{row.plannedShifts ? `${row.presentShifts} / ${row.plannedShifts}` : "—"}</td>
                    <td>{row.lateCount ? <><strong>{row.lateDuration}</strong> <span className="text-xs text-slate-500">({row.lateCount})</span></> : "—"}</td>
                    <td>{row.longestLate ? row.longestLate.duration : "—"}</td>
                    <td>{row.absences.length ? <>{row.absentDays} <span className="text-xs text-slate-500">non justifiée(s) / {row.absences.length}</span></> : "—"}</td>
                    <td className="text-xs">{Object.values(row.leaveDays).reduce((sum, days) => sum + days, 0) || "—"}</td>
                    <td className="text-right">{(row.lateEntries.length > 0 || row.absences.length > 0) && <Button small tone="secondary" onClick={() => setOpen(open === row.employee.id ? null : row.employee.id)}>{open === row.employee.id ? "Masquer" : "Détail"}</Button>}</td>
                  </tr>
                  {open === row.employee.id && (
                    <tr><td colSpan={7} className="bg-slate-50 p-3 dark:bg-slate-800/40">
                      <ul className="space-y-1 text-sm">
                        {row.lateEntries.map((entry) => (
                          <li key={entry.attendanceId} className="flex flex-wrap items-center justify-between gap-2">
                            <span>{day(entry.date)} : prévu {time(entry.plannedStartAt)}, arrivé {dateTime(entry.clockInAt)} — <strong>{entry.duration}</strong>{entry.note ? ` · ${entry.note}` : ""}</span>
                            {report.canEdit && <Button small tone="secondary" onClick={() => justify(entry.attendanceId, !entry.justified)}>{entry.justified ? "Retirer la justification" : "Justifier"}</Button>}
                          </li>
                        ))}
                        {row.absences.map((absence) => (
                          <li key={`${absence.date}-${absence.source}`} className="flex flex-wrap items-center justify-between gap-2">
                            <span>{day(absence.date)} : absence {absence.source === "DETECTED" ? "(poste prévu sans pointage)" : "(enregistrée)"}{absence.note ? ` · ${absence.note}` : ""} <Badge tone={absence.justified ? "green" : "red"}>{absence.justified ? "justifiée" : "non justifiée"}</Badge></span>
                            {report.canEdit && (absence.attendanceId
                              ? <Button small tone="secondary" onClick={() => justify(absence.attendanceId!, !absence.justified)}>{absence.justified ? "Retirer la justification" : "Justifier"}</Button>
                              : <Button small tone="secondary" onClick={async () => { const note = window.prompt("Justification de l’absence"); if (!note) return; try { await hrApi.recordAbsence({ employeeId: row.employee.id, date: absence.date, justified: true, note }); load(); } catch (reason) { setError(errorText(reason, "Action impossible.")); } }}>Justifier</Button>)}
                          </li>
                        ))}
                      </ul>
                    </td></tr>
                  )}
                </Fragment>
              ))}</tbody>
            </table></div>
          </Card>
        </>
      )}
      {absenceDialog && <AbsenceDialog onClose={() => setAbsenceDialog(false)} onDone={() => { setAbsenceDialog(false); setNotice("Absence enregistrée."); load(); }} />}
    </div>
  );
}

function AbsenceDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [employees, setEmployees] = useState<HrEmployee[]>([]);
  const [form, setForm] = useState({ employeeId: "", date: new Date().toISOString().slice(0, 10), justified: false, note: "" });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { hrApi.employees().then((data) => setEmployees(data.employees)).catch(() => setEmployees([])); }, []);
  const submit = async () => {
    try { await hrApi.recordAbsence(form); onDone(); } catch (reason) { setError(errorText(reason, "Enregistrement impossible.")); }
  };
  return (
    <Modal title="Enregistrer une absence" onClose={onClose}>
      <Field label="Employé"><select className={inputClass} value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}><option value="">— Choisir —</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></Field>
      <Field label="Date"><input type="date" className={inputClass} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.justified} onChange={(e) => setForm({ ...form, justified: e.target.checked })} /> Absence justifiée (non retenue sur la paie)</label>
      <Field label="Note"><input className={inputClass} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex justify-end gap-2"><Button tone="secondary" onClick={onClose}>Annuler</Button><Button onClick={submit} disabled={!form.employeeId || !form.date}>Enregistrer</Button></div>
    </Modal>
  );
}
