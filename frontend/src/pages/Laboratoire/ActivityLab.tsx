import { useEffect, useState } from "react";
import { Activity, AlertTriangle, Beaker, ClipboardList, Layers, ToggleLeft, Users, X } from "lucide-react";
import { AdminPageShell, Panel, StatCard, DataTable, formatDate } from "../Administration/adminUi";
import { fetchLaboratoryActivity, fetchLaboratoryRequestDetail, LabActivityPayload, submitLaboratoryResult, updateDirectResultAuthorization } from "../../api/laboratory";
import { useAuth } from "../../context/AuthContext";

export default function ActivityLab() {
  const { currentUser } = useAuth();
  const [activity, setActivity] = useState<LabActivityPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingAuthorization, setIsSavingAuthorization] = useState(false);
  const [directResultAuthorizationEnabled, setDirectResultAuthorizationEnabled] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<any | null>(null);
  const [requestDetail, setRequestDetail] = useState<any | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [resultForm, setResultForm] = useState({
    resultName: "",
    resultValue: "",
    interpretation: "",
  });
  const [isSubmittingResult, setIsSubmittingResult] = useState(false);
  const [showSendChoice, setShowSendChoice] = useState(false);
  const [deliveryMode, setDeliveryMode] = useState<"validation" | "direct">("validation");

  const isLabManager = currentUser?.primaryRole === "LAB_MANAGER" || currentUser?.primaryRole === "ADMIN" || currentUser?.primaryRole === "SUPER_ADMIN";
  const currentItem = requestDetail?.items?.[0];
  const latestResult = currentItem?.results?.[0] || requestDetail?.results?.[0];
  const lockedResultStatuses = new Set(["TECHNICAL_VALIDATED", "BIOLOGICALLY_VALIDATED", "AVAILABLE", "SENT", "VERIFIED", "COMPLETED"]);
  const lockedRequestStatuses = new Set(["AVAILABLE", "SENT", "VERIFIED", "COMPLETED"]);
  const lockedItemStatuses = new Set(["AVAILABLE", "SENT"]);
  const isResultLocked = [
    (latestResult?.resultStatus || "").toUpperCase(),
    (requestDetail?.status || "").toUpperCase(),
    (currentItem?.status || "").toUpperCase(),
  ].some((status) => lockedResultStatuses.has(status) || lockedRequestStatuses.has(status) || lockedItemStatuses.has(status));
  const isItemAssigned = Boolean(currentItem?.assignedToId);
  const isAssignedToCurrentTechnician = Boolean(currentItem?.assignedToId && currentUser?.id && currentItem.assignedToId === currentUser?.id);
  const canSubmitResult = !isResultLocked && (!isItemAssigned || isAssignedToCurrentTechnician || isLabManager);
  const resultButtonLabel = isResultLocked ? "Résultat déjà transmis" : isItemAssigned ? "Envoyer le résultat" : "Enregistrer le résultat";
  const requesterSummary = requestDetail?.consultation?.provider
    ? `Médecin ${[requestDetail.consultation.provider.firstName, requestDetail.consultation.provider.lastName].filter(Boolean).join(" ") || requestDetail.consultation.provider.displayName || "Demandeur"}`
    : `Patient ${[requestDetail?.patient?.firstName, requestDetail?.patient?.lastName].filter(Boolean).join(" ") || "Demandeur"}`;
  const requesterPhone = requestDetail?.consultation?.provider?.phone || requestDetail?.patient?.phone || requestDetail?.requestedBy?.phone || null;

  const loadActivity = async () => {
    setIsLoading(true);
    try {
      const data = await fetchLaboratoryActivity();
      setActivity(data);
      setDirectResultAuthorizationEnabled(Boolean(data.directResultAuthorizationEnabled));
    } catch (error) {
      console.error("Impossible de charger l'activité laboratoire", error);
      setActivity(null);
    } finally {
      setIsLoading(false);
    }
  };

  const openRequestDetail = async (requestId: string) => {
    setIsDetailLoading(true);
    setSelectedRequest(requestId);
    try {
      const detail = await fetchLaboratoryRequestDetail(requestId);
      setRequestDetail(detail);
      const firstItem = detail?.items?.[0];
      setResultForm({
        resultName: firstItem?.labTest?.name || "",
        resultValue: "",
        interpretation: "",
      });
      setShowSendChoice(false);
      setDeliveryMode("validation");
    } catch (error) {
      console.error("Impossible de charger le détail de la demande", error);
      setRequestDetail(null);
    } finally {
      setIsDetailLoading(false);
    }
  };

  const submitResult = async () => {
    if (!selectedRequest) return;

    setIsSubmittingResult(true);
    try {
      await submitLaboratoryResult(selectedRequest, {
        ...resultForm,
        labRequestItemId: currentItem?.id || null,
        deliveryMode: isItemAssigned ? deliveryMode : undefined,
      });
      setShowSendChoice(false);
      setRequestDetail(null);
      setSelectedRequest(null);
      await loadActivity();
    } catch (error) {
      console.error("Impossible d'enregistrer le résultat", error);
    } finally {
      setIsSubmittingResult(false);
    }
  };

  const handleSubmitResult = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedRequest) return;

    if (isResultLocked) {
      return;
    }

    if (isItemAssigned && !canSubmitResult) {
      return;
    }

    if (isItemAssigned && (isAssignedToCurrentTechnician || isLabManager)) {
      setShowSendChoice(true);
      return;
    }

    await submitResult();
  };

  const handleAuthorizationToggle = async () => {
    if (!isLabManager) {
      return;
    }

    setIsSavingAuthorization(true);
    try {
      const response = await updateDirectResultAuthorization(!directResultAuthorizationEnabled);
      setDirectResultAuthorizationEnabled(Boolean(response.enabled));
      await loadActivity();
    } catch (error) {
      console.error("Impossible de mettre à jour l'autorisation d'envoi direct", error);
    } finally {
      setIsSavingAuthorization(false);
    }
  };

  useEffect(() => {
    loadActivity();

    const handler = () => {
      loadActivity();
    };
    window.addEventListener("aulia:lab.request.created", handler);
    window.addEventListener("aulia:lab.result.created", handler);
    return () => {
      window.removeEventListener("aulia:lab.request.created", handler);
      window.removeEventListener("aulia:lab.result.created", handler);
    };
  }, []);

  return (
    <AdminPageShell
      title="Activité Laboratoire"
      subtitle="Vue opérationnelle en temps réel basée sur les demandes, les échantillons et le personnel de laboratoire."
      actions={
        <button
          onClick={loadActivity}
          disabled={isLoading}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? 'Chargement...' : 'Actualiser'}
        </button>
      }
    >
      <section className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
              <ToggleLeft size={18} className="text-emerald-700" />
              Envoi direct des résultats
            </p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              {isLabManager
                ? ""
                : "Activez ce réglage pour autoriser les techniciens actifs selon leur shift à envoyer directement les résultats au patient ou au médecin."}
            </p>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-3 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
              checked={directResultAuthorizationEnabled}
              onChange={handleAuthorizationToggle}
              disabled={!isLabManager || isSavingAuthorization}
            />
            <span>{directResultAuthorizationEnabled ? "Autorisation activée" : "Autorisation désactivée"}</span>
          </label>
        </div>
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
          Si l’option est désactivée, les techniciens transmettent d’abord le résultat au responsable pour validation avant envoi.
        </p>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <StatCard icon={<ClipboardList size={20} />} label="Demandes totales" value={activity?.totalRequests ?? "–"} tone="blue" />
        <StatCard icon={<Beaker size={20} />} label="Demandes en attente" value={activity?.pendingRequests ?? "–"} tone="amber" />
        <StatCard icon={<Users size={20} />} label="Analyse en validation" value={activity?.validationQueueCount ?? "–"} tone="red" />
        <StatCard icon={<Activity size={20} />} label="Technique validées" value={activity?.technicalValidationCount ?? "–"} tone="green" />
        <StatCard icon={<Layers size={20} />} label="Biologique validées" value={activity?.biologicalValidationCount ?? "–"} tone="green" />
        <StatCard icon={<AlertTriangle size={20} />} label="Échantillons reçus" value={activity?.sampleReceivedCount ?? "–"} tone="slate" />
      </section>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Panel title="Demandes récentes" subtitle="20 dernières demandes de laboratoire les plus récentes.">
            <DataTable
              headers={["ID", "Patient", "Statut", "Priorité", "Examen", "Assigné à", "Demandé le"]}
              rows={activity?.recentRequests.map((request) => [
                <button key={request.id} onClick={() => openRequestDetail(request.id)} className="text-left font-semibold text-emerald-700 hover:underline">
                  {request.displayId}
                </button>,
                request.patientName,
                request.status,
                request.priority,
                request.specimenType,
                request.assignedTo || "Non assigné",
                formatDate(request.requestedAt),
              ]) ?? []}
            />
          </Panel>

          <Panel title="Travail technicien" subtitle="Charge de travail par technicien sur demandes ouvertes.">
            <div className="space-y-3">
              {(activity?.technicianWorkloads.length ?? 0) === 0 ? (
                <p className="text-sm text-slate-500">Aucune charge de travail disponible.</p>
              ) : (
                activity?.technicianWorkloads.slice(0, 6).map((workload, index) => (
                  <div key={index} className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white">{workload.technician}</p>
                        <p className="text-xs text-slate-500">Demandes assignées: {workload.assignedItems}</p>
                      </div>
                      <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">Ouvertes: {workload.openItems}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Panel>
        </div>

        <aside className="space-y-6">
          <Panel title="Alertes lab" subtitle="Points d'attention immédiats pour le laboratoire.">
            {activity?.lowStockAlerts.length === 0 && activity?.criticalAlerts.length === 0 ? (
              <p className="text-sm text-slate-500">Aucune alerte détectée.</p>
            ) : (
              <div className="space-y-4">
                {activity?.criticalAlerts.slice(0, 4).map((alert, index) => (
                  <div key={`critical-${index}`} className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/20">
                    <p className="font-semibold">{alert.displayId || alert.title}</p>
                    <p className="mt-1">{alert.message}</p>
                    <p className="mt-1 text-xs text-slate-600">{formatDate(alert.createdAt)}</p>
                  </div>
                ))}
                {activity?.lowStockAlerts.slice(0, 4).map((alert, index) => (
                  <div key={`stock-${index}`} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20">
                    <p className="font-semibold">Stock critique: {alert.consumableName}</p>
                    <p className="mt-1">Quantité: {alert.quantity} — Seuil min: {alert.minimumLevel ?? 'N/A'}</p>
                    <p className="mt-1 text-xs text-slate-600">Localisation: {alert.location}</p>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Flux d'échantillons" subtitle="Surveillance simple des prélèvements et réceptions.">
            <div className="grid gap-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                <p className="text-sm text-slate-500">Échantillons collectés</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{activity?.sampleCollectedCount ?? "–"}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                <p className="text-sm text-slate-500">Échantillons reçus</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{activity?.sampleReceivedCount ?? "–"}</p>
              </div>
            </div>
          </Panel>
        </aside>
      </div>

      {requestDetail ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="max-h-[90vh] w-full max-w-6xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Examen demandé</p>
                <h3 className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">{requestDetail?.id}</h3>
              </div>
              <button onClick={() => { setRequestDetail(null); setSelectedRequest(null); }} className="rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                <X size={18} />
              </button>
            </div>

            {isDetailLoading ? (
              <p className="mt-6 text-sm text-slate-500">Chargement du détail...</p>
            ) : (
              <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                <div className="space-y-6">
                  <Panel title="Dossier patient" subtitle="Informations complètes du patient concerné.">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-slate-500">Patient</p>
                        <p className="mt-1 font-semibold text-slate-900 dark:text-white">{[requestDetail?.patient?.firstName, requestDetail?.patient?.lastName].filter(Boolean).join(" ") || "Patient inconnu"}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-slate-500">Téléphone</p>
                        <p className="mt-1 text-slate-700 dark:text-slate-300">{requestDetail?.patient?.phone || "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-slate-500">Email</p>
                        <p className="mt-1 text-slate-700 dark:text-slate-300">{requestDetail?.patient?.email || "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-slate-500">Adresse</p>
                        <p className="mt-1 text-slate-700 dark:text-slate-300">{requestDetail?.patient?.address || "—"}</p>
                      </div>
                    </div>
                  </Panel>

                  <Panel title="Détails de l’examen" subtitle="Section, catégorie, examen, paramètres, échantillons et consommables associés.">
                    {requestDetail?.items?.map((item: any, index: number) => (
                      <div key={item.id || index} className="space-y-4 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                        <div className="grid gap-4 md:grid-cols-2">
                          <div>
                            <p className="text-xs uppercase tracking-wide text-slate-500">Section</p>
                            <p className="mt-1 font-semibold text-slate-900 dark:text-white">{item?.labTest?.section?.name || "—"}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-wide text-slate-500">Catégorie</p>
                            <p className="mt-1 font-semibold text-slate-900 dark:text-white">{item?.labTest?.category?.name || "—"}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-wide text-slate-500">Examen</p>
                            <p className="mt-1 font-semibold text-slate-900 dark:text-white">{item?.labTest?.name || "—"}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-wide text-slate-500">Statut</p>
                            <p className="mt-1 font-semibold text-slate-900 dark:text-white">{item?.status || "—"}</p>
                          </div>
                        </div>

                        <div>
                          <p className="text-xs uppercase tracking-wide text-slate-500">Paramètres</p>
                          <ul className="mt-2 space-y-2 text-sm text-slate-700 dark:text-slate-300">
                            {(item?.labTest?.parameterTemplates || []).length === 0 ? (
                              <li>Aucun paramètre défini.</li>
                            ) : item.labTest.parameterTemplates.map((parameter: any) => (
                              <li key={parameter.id} className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
                                {parameter.name} — {parameter.unit || "unité non précisée"}
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div>
                          <p className="text-xs uppercase tracking-wide text-slate-500">Échantillons</p>
                          <ul className="mt-2 space-y-2 text-sm text-slate-700 dark:text-slate-300">
                            {(item?.samples || []).length === 0 ? (
                              <li>Aucun échantillon associé.</li>
                            ) : item.samples.map((sample: any) => (
                              <li key={sample.id} className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
                                {sample.labSampleType?.name || "Échantillon"} — {sample.status}
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div>
                          <p className="text-xs uppercase tracking-wide text-slate-500">Exigences et consommables</p>
                          <ul className="mt-2 space-y-2 text-sm text-slate-700 dark:text-slate-300">
                            {(item?.labTest?.consumableRequirements || []).length === 0 ? (
                              <li>Aucun consommable requis.</li>
                            ) : item.labTest.consumableRequirements.map((requirement: any) => (
                              <li key={requirement.id} className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
                                {requirement.labConsumable?.name} — {requirement.quantity} {requirement.unit || requirement.labConsumable?.unit || ""}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    ))}
                  </Panel>
                </div>

                <div>
                  <Panel title="Saisie du résultat" subtitle="Trois champs principaux pour enregistrer le résultat.">
                    <form onSubmit={handleSubmitResult} className="space-y-4">
                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">Nom du résultat</label>
                        <input
                          value={resultForm.resultName}
                          onChange={(event) => setResultForm((current) => ({ ...current, resultName: event.target.value }))}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">Valeur</label>
                        <input
                          value={resultForm.resultValue}
                          onChange={(event) => setResultForm((current) => ({ ...current, resultValue: event.target.value }))}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">Interprétation</label>
                        <textarea
                          value={resultForm.interpretation}
                          onChange={(event) => setResultForm((current) => ({ ...current, interpretation: event.target.value }))}
                          rows={4}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
                        />
                      </div>
                      {isResultLocked ? (
                        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300">
                          Cet examen a déjà été validé et transmis au médecin. Il ne peut plus être modifié par le laboratoire.
                        </p>
                      ) : !canSubmitResult ? (
                        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
                          Cet examen est attribué à un autre technicien. Seul le technicien assigné ou le responsable peut transmettre le résultat.
                        </p>
                      ) : null}
                      <button
                        type="submit"
                        disabled={isSubmittingResult || !canSubmitResult || isResultLocked}
                        className="w-full rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isSubmittingResult ? "Enregistrement..." : resultButtonLabel}
                      </button>
                    </form>
                  </Panel>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {showSendChoice ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Choix d’envoi du résultat</p>
            <h3 className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">Comment transmettre le résultat ?</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              {requesterSummary}{requesterPhone ? ` • ${requesterPhone}` : ""}
            </p>
            <div className="mt-4 space-y-3">
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <input
                  type="radio"
                  name="deliveryMode"
                  value="validation"
                  checked={deliveryMode === "validation"}
                  onChange={() => setDeliveryMode("validation")}
                  className="mt-1 h-4 w-4"
                />
                <span>
                  <span className="block font-semibold text-slate-900 dark:text-white">Envoyer au responsable de laboratoire pour validation</span>
                  <span className="mt-1 block text-sm text-slate-600 dark:text-slate-300">Le responsable pourra valider le résultat avant l’envoi.</span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <input
                  type="radio"
                  name="deliveryMode"
                  value="direct"
                  checked={deliveryMode === "direct"}
                  onChange={() => setDeliveryMode("direct")}
                  className="mt-1 h-4 w-4"
                />
                <span>
                  <span className="block font-semibold text-slate-900 dark:text-white">Envoyer directement au demandeur</span>
                  <span className="mt-1 block text-sm text-slate-600 dark:text-slate-300">Le résultat sera transmis directement au médecin ou au patient selon le demandeur.</span>
                </span>
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setShowSendChoice(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200">
                Annuler
              </button>
              <button type="button" onClick={submitResult} disabled={isSubmittingResult} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60">
                {isSubmittingResult ? "Envoi..." : "Confirmer"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AdminPageShell>
  );
}
