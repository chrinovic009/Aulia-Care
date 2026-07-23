import { useEffect, useMemo, useState } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { apiFetch } from "../../config/api";

type ImagingRequest = {
  id: string; modality: string; bodyPart: string; urgency?: string | null; status: string; notes?: string | null; createdAt: string;
  patient?: { firstName: string; lastName: string; externalId?: string | null };
  requestedBy?: { displayName?: string | null };
  report?: { findings: string; impression: string; recommendations?: string | null; verified: boolean } | null;
};

const displayStatus = (status: string) => ({ REQUESTED: "Demandé", SCHEDULED: "Planifié", IN_PROGRESS: "En cours", COMPLETED: "Terminé", VERIFIED: "Validé", CANCELLED: "Annulé" }[status] || status);

export default function DashboardRadio() {
  const [requests, setRequests] = useState<ImagingRequest[]>([]);
  const [selected, setSelected] = useState<ImagingRequest | null>(null);
  const [findings, setFindings] = useState("");
  const [impression, setImpression] = useState("");
  const [recommendations, setRecommendations] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try { setRequests(await apiFetch<ImagingRequest[]>("/imaging")); setError(null); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Impossible de charger les demandes de radiologie."); }
  };
  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 15_000); return () => window.clearInterval(timer); }, []);
  const waiting = useMemo(() => requests.filter((item) => ["REQUESTED", "SCHEDULED", "IN_PROGRESS"].includes(item.status)), [requests]);
  const open = (request: ImagingRequest) => { setSelected(request); setFindings(request.report?.findings || ""); setImpression(request.report?.impression || ""); setRecommendations(request.report?.recommendations || ""); };
  const saveReport = async (verified: boolean) => {
    if (!selected) return;
    try {
      await apiFetch(`/imaging/${selected.id}/report`, { method: "POST", body: JSON.stringify({ findings, impression, recommendations, verified }) });
      setSelected(null); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Le compte-rendu n'a pas été enregistré."); }
  };
  return <div className="min-h-screen bg-slate-50 p-4 dark:bg-slate-950 sm:p-6">
    <PageMeta title="Radiologie | Aulia Care" description="File clinique et comptes-rendus de radiologie" />
    <PageBreadcrumb pageTitle="Radiologie" />
    <section className="rounded-xl bg-slate-900 p-6 text-white"><p className="text-sm text-slate-300">Aulia Care · Imagerie médicale</p><h1 className="mt-1 text-2xl font-semibold">Demandes, examens et comptes-rendus</h1><p className="mt-2 text-sm text-slate-300">Le radiologue enregistre et valide le résultat; le médecin accède ensuite au compte-rendu dans le dossier patient.</p></section>
    {error ? <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
    <div className="mt-5 grid gap-4 sm:grid-cols-3"><Metric label="Demandes actives" value={waiting.length} /><Metric label="À valider" value={requests.filter((item) => item.status === "COMPLETED").length} /><Metric label="Validées" value={requests.filter((item) => item.status === "VERIFIED").length} /></div>
    <section className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-slate-500 dark:bg-slate-800"><tr><th className="p-4">Patient</th><th className="p-4">Examen</th><th className="p-4">Urgence</th><th className="p-4">Statut</th><th className="p-4">Action</th></tr></thead><tbody>{requests.map((request) => <tr key={request.id} className="border-t border-slate-100 dark:border-slate-800"><td className="p-4 font-medium">{[request.patient?.lastName, request.patient?.firstName].filter(Boolean).join(" ") || "Patient"}</td><td className="p-4">{request.modality} · {request.bodyPart}</td><td className="p-4">{request.urgency || "ROUTINE"}</td><td className="p-4">{displayStatus(request.status)}</td><td className="p-4"><button onClick={() => open(request)} className="rounded-lg border border-slate-300 px-3 py-1.5 font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-100">{request.report ? "Voir / modifier" : "Interpréter"}</button></td></tr>)}</tbody></table></div></section>
    {selected ? <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 p-4"><div className="mx-auto my-6 max-w-3xl rounded-xl bg-white p-6 shadow-xl dark:bg-slate-900"><div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">Compte-rendu · {selected.modality} {selected.bodyPart}</h2><p className="text-sm text-slate-500">{[selected.patient?.lastName, selected.patient?.firstName].filter(Boolean).join(" ")}</p></div><button onClick={() => setSelected(null)} className="text-sm font-semibold">Fermer</button></div><div className="mt-5 space-y-4"><Field label="Constatations" value={findings} onChange={setFindings} /><Field label="Conclusion / impression" value={impression} onChange={setImpression} /><Field label="Recommandations" value={recommendations} onChange={setRecommendations} required={false} /></div><div className="mt-5 flex flex-wrap justify-end gap-2"><button onClick={() => void saveReport(false)} className="rounded-lg border px-4 py-2 font-semibold">Enregistrer</button><button onClick={() => void saveReport(true)} className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white">Valider le compte-rendu</button></div></div></div> : null}
  </div>;
}
function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{value}</p></div>; }
function Field({ label, value, onChange, required = true }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) { return <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">{label}{required ? " *" : ""}<textarea value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 min-h-28 w-full rounded-lg border border-slate-300 p-3 font-normal dark:border-slate-700 dark:bg-slate-950" /></label>; }
