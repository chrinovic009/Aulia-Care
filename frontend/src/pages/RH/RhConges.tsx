import { useCallback, useEffect, useState } from "react";
import { hrApi, type AdminLeave } from "../../api/hr";
import { Badge, Button, Card, dateTime, day, errorText, LEAVE_STATUS, Notice, REPLACEMENT_STATUS } from "./ui";

type Replacements = Awaited<ReturnType<typeof hrApi.replacements>>;

/** Leave, events and replacements: decided by the administration, visible to finance and the super administration. */
export default function RhConges() {
  const [status, setStatus] = useState("PENDING");
  const [leaves, setLeaves] = useState<{ canDecide: boolean; leaves: AdminLeave[] } | null>(null);
  const [replacements, setReplacements] = useState<Replacements | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    hrApi.leaves(status || undefined).then(setLeaves).catch((reason) => setError(errorText(reason, "Congés indisponibles.")));
    hrApi.replacements(status === "PENDING" ? "PENDING_ADMIN" : undefined).then(setReplacements).catch(() => setReplacements(null));
  }, [status]);
  useEffect(() => { load(); }, [load]);

  const decideLeave = async (leave: AdminLeave, decision: "APPROVE" | "REJECT") => {
    const note = decision === "REJECT" ? window.prompt("Raison du refus") : undefined;
    if (decision === "REJECT" && !note) return;
    try {
      await hrApi.decideLeave(leave.id, { decision, note: note ?? undefined });
      setNotice(decision === "APPROVE" ? "Congé accordé." : "Congé refusé.");
    } catch (reason) {
      const message = errorText(reason, "Décision impossible.");
      if (decision === "APPROVE" && message.startsWith("Solde insuffisant") && window.confirm(`${message}\n\nAccorder quand même ?`)) {
        try { await hrApi.decideLeave(leave.id, { decision, force: true }); setNotice("Congé accordé au-delà du solde."); } catch (again) { setError(errorText(again, "Décision impossible.")); }
      } else setError(message);
    }
    load();
  };
  const decideReplacement = async (id: string, decision: "APPROVE" | "REJECT") => {
    const note = decision === "REJECT" ? window.prompt("Raison du refus") : undefined;
    if (decision === "REJECT" && !note) return;
    try { await hrApi.decideReplacement(id, { decision, note: note ?? undefined }); setNotice(decision === "APPROVE" ? "Remplacement validé : le poste est ajouté au planning du collègue." : "Remplacement refusé."); } catch (reason) { setError(errorText(reason, "Décision impossible.")); }
    load();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-1 text-sm">
        {[["PENDING", "À décider"], ["APPROVED", "Accordés"], ["REJECTED", "Refusés"], ["", "Tous"]].map(([value, label]) => (
          <button key={value} type="button" onClick={() => setStatus(value)} className={`rounded-lg px-3 py-1.5 ${status === value ? "bg-aulia-teal/10 font-semibold text-aulia-teal" : "text-slate-600"}`}>{label}</button>
        ))}
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {notice && <Notice tone="success">{notice}</Notice>}
      <Card title="Congés et événements signalés">
        {!leaves ? <p className="text-sm text-slate-500">Chargement…</p> : leaves.leaves.length === 0 ? <p className="text-sm text-slate-500">Aucune demande.</p> : (
          <div className="overflow-x-auto"><table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500"><tr><th className="py-2">Employé</th><th>Motif</th><th>Période</th><th>Jours</th><th>Solde</th><th>État</th><th /></tr></thead>
            <tbody>{leaves.leaves.map((leave) => (
              <tr key={leave.id} className="border-t border-slate-100 align-top dark:border-slate-800">
                <td className="py-2"><span className="font-medium">{leave.employee.name}</span><span className="block text-xs text-slate-500">{[leave.employee.position, leave.employee.department].filter(Boolean).join(" · ")}</span></td>
                <td><span className="font-medium">{leave.typeLabel}</span>{leave.reason && <span className="block text-xs text-slate-500">{leave.reason}</span>}</td>
                <td>{day(leave.startDate)} → {day(leave.endDate)}</td>
                <td>{leave.days ?? "—"}</td>
                <td className="text-xs">{leave.balance ? <span className={leave.days !== null && leave.days > leave.balance.remaining ? "font-semibold text-red-600" : ""}>{leave.balance.remaining} j restants</span> : leave.deductsBalance ? "" : "hors solde"}</td>
                <td><Badge tone={LEAVE_STATUS[leave.status]?.tone}>{LEAVE_STATUS[leave.status]?.label}</Badge>{leave.decidedBy && <span className="block text-xs text-slate-500">par {leave.decidedBy}</span>}{leave.decisionNote && <span className="block text-xs text-slate-500">{leave.decisionNote}</span>}</td>
                <td className="space-x-1 whitespace-nowrap text-right">{leaves.canDecide && leave.status === "PENDING" && <><Button small onClick={() => decideLeave(leave, "APPROVE")}>Accorder</Button><Button small tone="danger" onClick={() => decideLeave(leave, "REJECT")}>Refuser</Button></>}</td>
              </tr>))}</tbody>
          </table></div>
        )}
      </Card>
      <Card title={status === "PENDING" ? "Remplacements à valider" : "Remplacements"}>
        {!replacements ? <p className="text-sm text-slate-500">Chargement…</p> : replacements.replacements.length === 0 ? <p className="text-sm text-slate-500">Aucun remplacement.</p> : (
          <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
            {replacements.replacements.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span><span className="font-medium">{row.replacer}</span> remplace <span className="font-medium">{row.requester}</span> · {dateTime(row.startAt)} → {dateTime(row.endAt)}{row.reason ? ` · ${row.reason}` : ""}</span>
                <span className="flex items-center gap-2">
                  <Badge tone={REPLACEMENT_STATUS[row.status]?.tone}>{REPLACEMENT_STATUS[row.status]?.label ?? row.status}</Badge>
                  {replacements.canDecide && row.status === "PENDING_ADMIN" && <><Button small onClick={() => decideReplacement(row.id, "APPROVE")}>Valider</Button><Button small tone="danger" onClick={() => decideReplacement(row.id, "REJECT")}>Refuser</Button></>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
