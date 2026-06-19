import { useEffect, useMemo, useState } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { apiFetch } from "../../config/api";

type LabRequest = {
  id: string;
  status: string;
  requestedAt: string;
  completedAt?: string | null;
  specimenType?: string | null;
  priority?: string | null;
  notes?: string | null;
  patient?: { firstName?: string; lastName?: string; phone?: string | null };
  requestedBy?: { displayName?: string | null; firstName?: string | null; lastName?: string | null };
  consultation?: { provider?: { displayName?: string | null; firstName?: string | null; lastName?: string | null } | null } | null;
  results?: Array<{ id: string; resultName: string; resultValue: string; units?: string | null; interpretation?: string | null; verified: boolean; reportedAt: string }>;
};

const formatName = (request: LabRequest) =>
  [request.patient?.firstName, request.patient?.lastName].filter(Boolean).join(" ") || "Patient non renseigne";

const formatUserName = (user?: { displayName?: string | null; firstName?: string | null; lastName?: string | null } | null) =>
  user?.displayName || [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "-";

const formatDate = (value?: string | null) =>
  value ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "-";

export default function DashboardLaboratoire() {
  const [requests, setRequests] = useState<LabRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<LabRequest | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [resultForm, setResultForm] = useState({
    resultName: "",
    resultValue: "",
    units: "",
    referenceRange: "",
    interpretation: "",
    verified: true,
  });

  const loadRequests = async () => {
    setIsLoading(true);
    try {
      const data = await apiFetch<LabRequest[]>("/laboratory");
      setRequests(data);
      setSelectedRequest((current) => current || data[0] || null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
    const handler = () => loadRequests();
    window.addEventListener("d7:consultation.created", handler);
    window.addEventListener("d7:patient.updated", handler);
    window.addEventListener("d7:clinicalDataUpdated", handler);
    window.addEventListener("d7:lab.request.created", handler);
    window.addEventListener("d7:lab.result.created", handler);
    return () => {
      window.removeEventListener("d7:consultation.created", handler);
      window.removeEventListener("d7:patient.updated", handler);
      window.removeEventListener("d7:clinicalDataUpdated", handler);
      window.removeEventListener("d7:lab.request.created", handler);
      window.removeEventListener("d7:lab.result.created", handler);
    };
  }, []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return requests.filter((request) => {
      const matchesStatus = statusFilter === "ALL" || request.status === statusFilter;
      const haystack = [formatName(request), request.specimenType, request.priority, request.notes, formatUserName(request.requestedBy)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return matchesStatus && (!normalized || haystack.includes(normalized));
    });
  }, [requests, query, statusFilter]);

  const metrics = useMemo(() => ({
    total: requests.length,
    pending: requests.filter((request) => ["REQUESTED", "IN_PROGRESS"].includes(request.status)).length,
    completed: requests.filter((request) => ["COMPLETED", "VERIFIED"].includes(request.status)).length,
    urgent: requests.filter((request) => ["URGENT", "CRITICAL"].includes((request.priority || "").toUpperCase())).length,
  }), [requests]);

  const submitResult = async () => {
    if (!selectedRequest || !resultForm.resultName.trim() || !resultForm.resultValue.trim()) {
      setMessage("Renseignez le nom et la valeur du resultat.");
      return;
    }

    await apiFetch(`/laboratory/${selectedRequest.id}/results`, {
      method: "POST",
      body: JSON.stringify(resultForm),
    });
    setResultForm({ resultName: "", resultValue: "", units: "", referenceRange: "", interpretation: "", verified: true });
    setMessage("Resultat transmis au medecin.");
    await loadRequests();
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 dark:bg-slate-950 sm:p-6">
      <PageMeta title="Laboratoire | D7 Clinique" description="Demandes d'examens et resultats en temps reel." />
      <PageBreadcrumb pageTitle="Laboratoire" />

      <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">Demandes depuis les medecins</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">Examens laboratoire</h1>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Reception, execution et validation des resultats patients.</p>
          </div>
          <button onClick={loadRequests} className="rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white">Actualiser</button>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-4">
          <Metric label="Demandes" value={metrics.total} />
          <Metric label="En attente" value={metrics.pending} tone="amber" />
          <Metric label="Terminees" value={metrics.completed} tone="green" />
          <Metric label="Urgentes" value={metrics.urgent} tone="red" />
        </div>
      </section>

      {message && <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-700">{message}</div>}

      <div className="mt-6 grid gap-6 xl:grid-cols-[420px_1fr]">
        <aside className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="grid gap-3 md:grid-cols-[1fr_150px] xl:grid-cols-1">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher patient, examen, medecin..." className="rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white">
              <option value="ALL">Tous</option>
              <option value="REQUESTED">Demandes</option>
              <option value="IN_PROGRESS">En cours</option>
              <option value="COMPLETED">Completes</option>
              <option value="VERIFIED">Verifiees</option>
            </select>
          </div>

          <div className="mt-4 space-y-3">
            {isLoading ? (
              <p className="text-sm text-slate-500">Chargement...</p>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-slate-500">Aucune demande trouvee.</p>
            ) : filtered.map((request) => (
              <button
                key={request.id}
                onClick={() => setSelectedRequest(request)}
                className={`w-full rounded-lg border p-3 text-left transition ${selectedRequest?.id === request.id ? "border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/40" : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">{formatName(request)}</p>
                    <p className="mt-1 text-xs text-slate-500">{request.specimenType || "Examen"} - {formatDate(request.requestedAt)}</p>
                  </div>
                  <StatusBadge status={request.status} />
                </div>
                <p className="mt-2 text-xs text-slate-500">Medecin: {formatUserName(request.requestedBy || request.consultation?.provider)}</p>
              </button>
            ))}
          </div>
        </aside>

        <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          {!selectedRequest ? (
            <p className="text-sm text-slate-500">Selectionnez une demande.</p>
          ) : (
            <div>
              <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 dark:border-slate-800 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900 dark:text-white">{formatName(selectedRequest)}</h2>
                  <p className="mt-1 text-sm text-slate-500">{selectedRequest.specimenType || "Examen"} - demande le {formatDate(selectedRequest.requestedAt)}</p>
                  <p className="mt-1 text-sm text-slate-500">Medecin demandeur: {formatUserName(selectedRequest.requestedBy || selectedRequest.consultation?.provider)}</p>
                </div>
                <StatusBadge status={selectedRequest.status} />
              </div>

              <div className="mt-5 grid gap-4 xl:grid-cols-2">
                <Panel title="Demande">
                  <Info label="Priorite" value={selectedRequest.priority || "NORMAL"} />
                  <Info label="Telephone patient" value={selectedRequest.patient?.phone || "-"} />
                  <Info label="Notes cliniques" value={selectedRequest.notes || "-"} />
                </Panel>

                <Panel title="Resultats existants">
                  {(selectedRequest.results || []).length === 0 ? (
                    <p className="text-sm text-slate-500">Aucun resultat saisi.</p>
                  ) : selectedRequest.results?.map((result) => (
                    <div key={result.id} className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-950">
                      <p className="font-semibold text-slate-900 dark:text-white">{result.resultName}: {result.resultValue} {result.units || ""}</p>
                      <p className="mt-1 text-xs text-slate-500">{formatDate(result.reportedAt)} - {result.verified ? "Verifie" : "Non verifie"}</p>
                      {result.interpretation && <p className="mt-2 text-slate-600 dark:text-slate-300">{result.interpretation}</p>}
                    </div>
                  ))}
                </Panel>
              </div>

              <Panel title="Saisir un resultat">
                <div className="grid gap-3 md:grid-cols-2">
                  <FormInput label="Nom du resultat" value={resultForm.resultName} onChange={(value) => setResultForm((current) => ({ ...current, resultName: value }))} />
                  <FormInput label="Valeur" value={resultForm.resultValue} onChange={(value) => setResultForm((current) => ({ ...current, resultValue: value }))} />
                  <FormInput label="Unite" value={resultForm.units} onChange={(value) => setResultForm((current) => ({ ...current, units: value }))} />
                  <FormInput label="Valeurs de reference" value={resultForm.referenceRange} onChange={(value) => setResultForm((current) => ({ ...current, referenceRange: value }))} />
                  <label className="md:col-span-2 text-sm">
                    <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">Interpretation</span>
                    <textarea value={resultForm.interpretation} onChange={(event) => setResultForm((current) => ({ ...current, interpretation: event.target.value }))} rows={3} className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
                  </label>
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                    <input type="checkbox" checked={resultForm.verified} onChange={(event) => setResultForm((current) => ({ ...current, verified: event.target.checked }))} />
                    Resultat verifie
                  </label>
                </div>
                <button onClick={submitResult} className="mt-4 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white">Transmettre au medecin</button>
              </Panel>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Metric({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "amber" | "green" | "red" }) {
  const colors = {
    default: "text-slate-900 dark:text-white",
    amber: "text-amber-700 dark:text-amber-300",
    green: "text-emerald-700 dark:text-emerald-300",
    red: "text-red-700 dark:text-red-300",
  };
  return <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950"><p className="text-xs text-slate-500">{label}</p><p className={`mt-2 text-2xl font-semibold ${colors[tone]}`}>{value}</p></div>;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="mt-4 rounded-lg border border-slate-200 p-4 dark:border-slate-800"><h3 className="font-semibold text-slate-900 dark:text-white">{title}</h3><div className="mt-3 space-y-3">{children}</div></div>;
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-950"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 font-medium text-slate-900 dark:text-white">{value}</p></div>;
}

function FormInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
    </label>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "VERIFIED" || status === "COMPLETED"
      ? "bg-emerald-100 text-emerald-700"
      : status === "REQUESTED"
      ? "bg-amber-100 text-amber-700"
      : "bg-blue-100 text-blue-700";
  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${tone}`}>{status}</span>;
}
