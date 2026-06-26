import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardList, RefreshCw, ShieldCheck } from "lucide-react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { AdminPageShell, DataTable, Panel, StatCard, formatDate } from "../Administration/adminUi";
import { apiFetch } from "../../config/api";
import { useAuth } from "../../context/AuthContext";

type ValidationItem = {
  id: string;
  requestId: string;
  patientName: string;
  testName: string;
  technicianName?: string | null;
  submittedAt?: string | null;
  technicalValidationAt?: string | null;
  elapsedMinutes?: number | null;
  priority?: string | null;
  status: string;
  resultStatus?: string | null;
  resultId?: string | null;
  resultName?: string | null;
  patientAge?: number | null;
  patientGender?: string | null;
  prescriberName?: string | null;
  serviceName?: string | null;
  prescriptionDate?: string | null;
  parameters?: Array<{
    id: string;
    name: string;
    value?: string | null;
    unit?: string | null;
    referenceRange?: string | null;
    interpretation?: string | null;
    outOfRange?: boolean | null;
  }>;
  validations?: Array<{
    id: string;
    decision: string;
    decisionDate?: string | null;
    validatorName?: string | null;
    technicianName?: string | null;
    comment?: string | null;
    observations?: string | null;
    instructions?: string | null;
    version?: number | null;
  }>;
  decision?: {
    decision?: string | null;
    decisionDate?: string | null;
    validatorName?: string | null;
    observations?: string | null;
    instructions?: string | null;
    reason?: string | null;
  } | null;
};

type ValidationResponse = {
  isManager: boolean;
  items: ValidationItem[];
};

const isManagerRole = (role?: string | null) => role === "LAB_MANAGER" || role === "ADMIN";

export default function ValidationsLab() {
  const { currentUser } = useAuth();
  const [items, setItems] = useState<ValidationItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<ValidationItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [decision, setDecision] = useState<"VALIDATE" | "REJECT" | "CORRECTION">("VALIDATE");
  const [reason, setReason] = useState("");
  const [observations, setObservations] = useState("");
  const [instructions, setInstructions] = useState("");
  const [priority, setPriority] = useState("HIGH");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const role = currentUser?.primaryRole ?? currentUser?.role ?? null;
  const isManager = isManagerRole(role);

  const loadItems = async () => {
    setLoading(true);
    try {
      const data = await apiFetch<ValidationResponse>("/laboratory/validations");
      setItems(data.items || []);
      setSelectedItem((current) => current || (data.items || [])[0] || null);
    } catch (error) {
      console.error("Impossible de charger les validations laboratoire", error);
      setItems([]);
      setSelectedItem(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
  }, []);

  const pendingItems = useMemo(() => items.filter((item) => item.resultStatus === "PENDING" || item.status === "TECHNICAL_VALIDATION"), [items]);
  const validatedItems = useMemo(() => items.filter((item) => ["BIOLOGICALLY_VALIDATED", "VERIFIED", "AVAILABLE"].includes(item.resultStatus || "")), [items]);
  const rejectedItems = useMemo(() => items.filter((item) => ["REJECTED", "CORRECTION_REQUESTED"].includes(item.resultStatus || "")), [items]);

  const submitDecision = async () => {
    if (!selectedItem) return;
    if (!isManager) {
      setMessage("Seuls les responsables laboratoire peuvent modifier une validation biologique.");
      return;
    }
    if (decision === "REJECT" && !reason.trim()) {
      setMessage("Le motif du refus est obligatoire.");
      return;
    }
    if ((decision === "CORRECTION" || decision === "REJECT") && !observations.trim()) {
      setMessage("Les observations sont obligatoires pour cette décision.");
      return;
    }

    setSubmitting(true);
    setMessage(null);
    try {
      await apiFetch(`/laboratory/validations/${selectedItem.id}/decision`, {
        method: "POST",
        body: JSON.stringify({
          decision,
          reason: reason || undefined,
          observations: observations || undefined,
          instructions: instructions || undefined,
          priority,
        }),
      });
      setMessage("Décision enregistrée avec succès.");
      setReason("");
      setObservations("");
      setInstructions("");
      await loadItems();
    } catch (error) {
      console.error("Impossible d'enregistrer la décision", error);
      setMessage("Impossible d'enregistrer la décision. Veuillez réessayer.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AdminPageShell
      title={isManager ? "Validations laboratoire" : "Suivi de mes analyses"}
      subtitle={isManager ? "Validation biologique, refus et correction des résultats laboratoire." : "Consultation des statuts de vos analyses et des décisions du responsable."}
      actions={
        <button onClick={loadItems} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
          <RefreshCw size={16} /> Actualiser
        </button>
      }
    >
      <PageMeta title="Validations laboratoire | D7 Clinique" description="Workflow complet de validation biologique et suivi des analyses." />
      <PageBreadcrumb pageTitle={isManager ? "Validations laboratoire" : "Suivi de mes analyses"} />

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard icon={<ClipboardList size={18} />} label="En attente" value={pendingItems.length} tone="amber" />
        <StatCard icon={<CheckCircle2 size={18} />} label="Validés" value={validatedItems.length} tone="green" />
        <StatCard icon={<AlertTriangle size={18} />} label="Refus / correction" value={rejectedItems.length} tone="red" />
        <StatCard icon={<ShieldCheck size={18} />} label="Mon rôle" value={isManager ? "Responsable" : "Technicien"} tone="blue" />
      </div>

      {message ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300">
          {message}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <Panel title={isManager ? "En attente de validation biologique" : "Mes analyses"} subtitle="Données chargées depuis le workflow laboratoire existant.">
            <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
              <DataTable
                headers={["Demande", "Patient", "Examen", "Technicien", "Statut", "Date saisie", "Priorité"]}
                rows={items.map((item) => [
                  item.requestId,
                  item.patientName,
                  item.testName,
                  item.technicianName || "-",
                  item.status,
                  formatDate(item.submittedAt),
                  item.priority || "NORMAL",
                ])}
              />
            </div>
          </Panel>

          <Panel title="Historique des validations" subtitle="Toutes les décisions successives conservées dans la traçabilité laboratoire.">
            <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
              <DataTable
                headers={["Patient", "Examen", "Décision", "Responsable", "Date", "Version"]}
                rows={(selectedItem?.validations || []).map((validation) => [
                  selectedItem?.patientName || "-",
                  selectedItem?.testName || "-",
                  validation.decision,
                  validation.validatorName || "-",
                  formatDate(validation.decisionDate),
                  validation.version || 1,
                ])}
              />
            </div>
          </Panel>
        </div>

        <aside className="space-y-6">
          <Panel title="Détail de l'analyse" subtitle="Informations patient, demande et résultats extraites de la base.">
            {loading ? (
              <p className="text-sm text-slate-500">Chargement...</p>
            ) : !selectedItem ? (
              <p className="text-sm text-slate-500">Aucune analyse sélectionnée.</p>
            ) : (
              <div className="space-y-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{selectedItem.patientName}</p>
                  <p className="mt-1 text-xs text-slate-500">{selectedItem.patientAge ?? "-"} ans • {selectedItem.patientGender || "-"}</p>
                  <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">Examen: {selectedItem.testName}</p>
                  <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">Prescripteur: {selectedItem.prescriberName || "-"}</p>
                  <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">Service: {selectedItem.serviceName || "-"}</p>
                </div>

                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Paramètres</h3>
                  {(selectedItem.parameters || []).length === 0 ? (
                    <p className="text-sm text-slate-500">Aucun paramètre enregistré.</p>
                  ) : (
                    selectedItem.parameters?.map((parameter) => (
                      <div key={parameter.id} className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-slate-900 dark:text-white">{parameter.name}</span>
                          {parameter.outOfRange ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">Hors limites</span> : null}
                        </div>
                        <p className="mt-1 text-slate-600 dark:text-slate-300">Valeur: {parameter.value ?? "-"} {parameter.unit || ""}</p>
                        <p className="text-xs text-slate-500">Référence: {parameter.referenceRange || "-"}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </Panel>

          {isManager ? (
            <Panel title="Décision du responsable" subtitle="Validation biologique, refus ou correction.">
              <div className="space-y-3">
                <label className="block text-sm">
                  <span className="mb-2 block text-slate-700 dark:text-slate-300">Action</span>
                  <select value={decision} onChange={(event) => setDecision(event.target.value as any)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
                    <option value="VALIDATE">Valider</option>
                    <option value="REJECT">Refuser</option>
                    <option value="CORRECTION">Demander une correction</option>
                  </select>
                </label>

                {decision === "REJECT" ? (
                  <label className="block text-sm">
                    <span className="mb-2 block text-slate-700 dark:text-slate-300">Motif du refus</span>
                    <input value={reason} onChange={(event) => setReason(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
                  </label>
                ) : null}

                <label className="block text-sm">
                  <span className="mb-2 block text-slate-700 dark:text-slate-300">Observations</span>
                  <textarea value={observations} onChange={(event) => setObservations(event.target.value)} rows={3} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
                </label>

                {decision === "CORRECTION" ? (
                  <>
                    <label className="block text-sm">
                      <span className="mb-2 block text-slate-700 dark:text-slate-300">Instructions de correction</span>
                      <textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} rows={3} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
                    </label>
                    <label className="block text-sm">
                      <span className="mb-2 block text-slate-700 dark:text-slate-300">Priorité</span>
                      <select value={priority} onChange={(event) => setPriority(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
                        <option value="HIGH">Haute</option>
                        <option value="MEDIUM">Moyenne</option>
                        <option value="LOW">Faible</option>
                      </select>
                    </label>
                  </>
                ) : null}

                <button onClick={submitDecision} disabled={submitting || !selectedItem} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
                  {submitting ? "Enregistrement..." : "Enregistrer la décision"}
                </button>
              </div>
            </Panel>
          ) : (
            <Panel title="Retour technicien" subtitle="Statut des analyses assignées et dernières décisions du responsable.">
              <div className="space-y-3">
                {items.filter((item) => item.technicianName).length === 0 ? (
                  <p className="text-sm text-slate-500">Aucune analyse assignée.</p>
                ) : items.map((item) => (
                  <div key={item.id} className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-slate-900 dark:text-white">{item.testName}</p>
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold uppercase text-slate-700 dark:bg-slate-900 dark:text-slate-200">{item.status}</span>
                    </div>
                    <p className="mt-1 text-slate-600 dark:text-slate-300">Patient: {item.patientName}</p>
                    <p className="mt-1 text-xs text-slate-500">Responsable: {item.validations?.[0]?.validatorName || "-"}</p>
                    {item.decision ? (
                      <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950">
                        <p><strong>Décision:</strong> {item.decision.decision}</p>
                        <p><strong>Observations:</strong> {item.decision.observations || "-"}</p>
                        <p><strong>Instructions:</strong> {item.decision.instructions || "-"}</p>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </aside>
      </div>
    </AdminPageShell>
  );
}
