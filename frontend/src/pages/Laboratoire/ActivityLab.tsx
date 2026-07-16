import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Beaker, ClipboardList, Layers, Users, X } from "lucide-react";
import { AdminPageShell, Panel, StatCard, DataTable, formatDate, formatDateTime } from "../Administration/adminUi";
import { 
  fetchLaboratoryActivity, 
  fetchLaboratoryRequest, 
  LabActivityPayload, 
  updateLaboratorySettings ,
  apiFetch
} from "../../api/laboratory";
import { type PatientRecord } from "../../api/reception";
import { useAuth } from "../../context/AuthContext";

type LabRequestResult = {
  resultStatus?: string | null;
  resultName?: string | null;
  resultValue?: string | null;
  interpretation?: string | null;
  units?: string | null;
  referenceRange?: string | null;
  reportedAt?: string | null;
};

type LabRequestDetailItem = {
  id?: string;
  status?: string | null;
  requestedAt?: string | null;
  assignedToId?: string | null;
  labTest?: {
    name?: string | null;
    section?: { name?: string | null } | null;
    category?: { name?: string | null } | null;
    referenceRange?: string | null;
    unit?: string | null;
    parameterTemplates?: Array<{ id: string; name?: string | null; unit?: string | null }>;
    sampleRequirements?: Array<{ id: string; labSampleType?: { name?: string | null } | null; volumeRequired?: string | number | null; volumeUnit?: string | null; storageCondition?: string | null; maxAgeMinutes?: string | number | null; instructions?: string | null }>;
    consumableRequirements?: Array<{ id: string; labConsumable?: { name?: string | null; unit?: string | null } | null; quantity?: string | number | null; unit?: string | null }>;
  } | null;
  results?: LabRequestResult[];
  samples?: Array<{ id: string; status?: string | null; labSampleType?: { name?: string | null } | null }>;
};

type LabRequestDetail = {
  id?: string;
  status?: string | null;
  items?: LabRequestDetailItem[];
  results?: LabRequestResult[];
  patient?: { id?: string; firstName?: string | null; lastName?: string | null; phone?: string | null; email?: string | null; address?: string | null } | null;
  consultation?: { provider?: { firstName?: string | null; lastName?: string | null; displayName?: string | null; phone?: string | null } | null } | null;
  requestedBy?: { phone?: string | null } | null;
};

export default function ActivityLab() {
  const { currentUser } = useAuth();
  const [activity, setActivity] = useState<LabActivityPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingAuthorization, setIsSavingAuthorization] = useState(false);
  const [directResultAuthorizationEnabled, setDirectResultAuthorizationEnabled] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<string | null>(null);
  const [requestDetail, setRequestDetail] = useState<LabRequestDetail | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [resultForm, setResultForm] = useState({
    resultName: "",
    resultValue: "",
    referenceRange: "",
    interpretation: "",
  });
  const [recentRequestsSearch, setRecentRequestsSearch] = useState("");
  const [isSubmittingResult, setIsSubmittingResult] = useState(false);
  const [showSendChoice, setShowSendChoice] = useState(false);
  const [deliveryMode, setDeliveryMode] = useState<"validation" | "direct">("validation");
  const [patientList, setPatientList] = useState<PatientRecord[] | null>(null);

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

  const patientPosition = useMemo(() => {
    if (!requestDetail?.patient?.id || !patientList?.length) return undefined;
    const sortedPatients = [...patientList].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return sortedPatients.findIndex((patient) => patient.id === requestDetail.patient?.id) + 1 || undefined;
  }, [patientList, requestDetail?.patient?.id]);

  const normalizeInitial = (value?: string | null) => {
    const trimmed = String(value || "").trim();
    return trimmed ? trimmed[0].toUpperCase() : "X";
  };

  const getLabStatusLabel = (requestStatus?: string | null, resultStatus?: string | null) => {
    const status = String(requestStatus || "").trim().toUpperCase();
    const result = String(resultStatus || "").trim().toUpperCase();
    const validatedStatuses = new Set(["TECHNICAL_VALIDATED", "BIOLOGICALLY_VALIDATED", "AVAILABLE", "SENT", "VERIFIED", "COMPLETED"]);
    const treatedStatuses = new Set(["PENDING", "CORRECTION_REQUESTED", "IN_ANALYSIS", "RECEIVED", "COLLECTED"]);
    const requestStatuses = new Set(["REQUESTED", "COLLECTED", "RECEIVED", "IN_ANALYSIS"]);

    if (validatedStatuses.has(result) || validatedStatuses.has(status)) {
      return "Validé";
    }

    if (result && treatedStatuses.has(result)) {
      return "Traité";
    }

    if (status && requestStatuses.has(status)) {
      return "Demande";
    }

    if (status && treatedStatuses.has(status)) {
      return "Traité";
    }

    return status ? status : "Demande";
  };

  const getExamRepeatCount = (requestedExamName?: string) => {
    if (!requestedExamName || !requestDetail?.items) return 1;
    return requestDetail.items.filter((item) => item.labTest?.name?.trim().toUpperCase() === requestedExamName.trim().toUpperCase()).length || 1;
  };

  const buildLabRequestDisplayId = (position?: number, patient?: LabRequestDetail["patient"], examCount?: number) => {
    if (!position) return requestDetail?.id || "-";
    const initials = `${normalizeInitial(patient?.firstName)}${normalizeInitial(patient?.lastName)}`;
    const count = examCount || 1;
    return `${position}${initials}-EXAMD${count}`;
  };

  const currentExamName = currentItem?.labTest?.name || requestDetail?.items?.[0]?.labTest?.name || "Examen";
  const currentExamRequestCount = getExamRepeatCount(currentExamName);
  const displayRequestId = buildLabRequestDisplayId(patientPosition, requestDetail?.patient, currentExamRequestCount);
  const translatedRequestStatus = getLabStatusLabel(requestDetail?.status, latestResult?.resultStatus);
  const isItemAssigned = Boolean(currentItem?.assignedToId);
  const isAssignedToCurrentTechnician = Boolean(currentItem?.assignedToId && currentUser?.id && currentItem.assignedToId === currentUser?.id);
  const canSubmitResult = !isResultLocked && (!isItemAssigned || isAssignedToCurrentTechnician || isLabManager);
  const resultButtonLabel = isResultLocked ? "Résultat déjà transmis" : isItemAssigned ? "Envoyer le résultat" : "Enregistrer le résultat";
  const requesterSummary = requestDetail?.consultation?.provider
    ? `Médecin ${[requestDetail.consultation.provider.firstName, requestDetail.consultation.provider.lastName].filter(Boolean).join(" ") || requestDetail.consultation.provider.displayName || "Demandeur"}`
    : `Patient ${[requestDetail?.patient?.firstName, requestDetail?.patient?.lastName].filter(Boolean).join(" ") || "Demandeur"}`;
  const requesterPhone = requestDetail?.consultation?.provider?.phone || requestDetail?.patient?.phone || requestDetail?.requestedBy?.phone || null;
  const canPrintResult = isResultLocked && Boolean(latestResult || requestDetail?.results?.[0]);

  const filteredRecentRequests = useMemo(() => {
    const query = recentRequestsSearch.trim().toLowerCase();
    if (!query) return activity?.recentRequests ?? [];

    return (activity?.recentRequests ?? []).filter((request) => {
      const haystack = [
        request.displayId,
        request.patientName,
        request.status,
        request.priority,
        request.specimenType,
        request.assignedTo || "non assigné",
        formatDate(request.requestedAt),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [activity?.recentRequests, recentRequestsSearch]);

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

  const formatReferenceRange = (item?: LabRequestDetailItem | null) => {
    const baseRange = String(item?.labTest?.referenceRange || "").trim();
    const unit = String(item?.labTest?.unit || "").trim();

    if (!baseRange) {
      return "";
    }

    if (unit && !baseRange.toLowerCase().includes(unit.toLowerCase())) {
      return `${baseRange} ${unit}`;
    }

    return baseRange;
  };

  const openRequestDetail = async (requestId: string) => {
    setIsDetailLoading(true);
    setSelectedRequest(requestId);
    try {
      const detail = await fetchLaboratoryRequest(requestId);
      setRequestDetail(detail as unknown as LabRequestDetail);
      const firstItem = (detail as unknown as LabRequestDetail)?.items?.[0];
      const examName = firstItem?.labTest?.name || firstItem?.results?.[0]?.resultName || "";
      const referenceRange = formatReferenceRange(firstItem);
      setResultForm({
        resultName: examName,
        resultValue: firstItem?.results?.[0]?.resultValue || "",
        referenceRange,
        interpretation: firstItem?.results?.[0]?.interpretation || "",
      });
      setShowSendChoice(false);
      setDeliveryMode("validation");

      if (!patientList && detail?.patient?.id) {
        try {
          const patientPositionFallback = detail?.patient?.id ? 1 : undefined;
          setPatientList((current) => current ?? [{
            id: detail.patient?.id || "",
            firstName: detail.patient?.firstName || "",
            lastName: detail.patient?.lastName || "",
            phone: detail.patient?.phone || "",
            email: detail.patient?.email || "",
            address: detail.patient?.address || "",
            createdAt: new Date().toISOString(),
          } as PatientRecord]);
          if (patientPositionFallback) {
            setPatientList((current) => current ?? []);
          }
        } catch (error) {
          console.error("Impossible de charger la liste des patients", error);
        }
      }
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
      // Utilisation directe d'apiFetch vers ton endpoint pour soumettre le résultat
      await apiFetch(`/laboratory/requests/${selectedRequest}/results`, {
        method: "POST",
        body: JSON.stringify({
          resultName: resultForm.resultName || currentItem?.labTest?.name || "Résultat laboratoire",
          resultValue: resultForm.resultValue,
          referenceRange: resultForm.referenceRange || currentItem?.labTest?.referenceRange || null,
          interpretation: resultForm.interpretation || null,
          units: currentItem?.labTest?.unit || null,
          labRequestItemId: currentItem?.id || null,
          deliveryMode: isItemAssigned ? deliveryMode : undefined,
        })
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
      // Utilisation de la fonction updateLaboratorySettings déclarée dans laboratory.ts
      await updateLaboratorySettings({
        technicianDirectRelease: !directResultAuthorizationEnabled
      });
      setDirectResultAuthorizationEnabled(!directResultAuthorizationEnabled);
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

  const printLaboratoryResultDocument = () => {
    if (!requestDetail) return;

    const patientName = [requestDetail.patient?.firstName, requestDetail.patient?.lastName].filter(Boolean).join(" ") || "Patient inconnu";
    const examName = currentItem?.labTest?.name || requestDetail.items?.[0]?.labTest?.name || "Analyse laboratoire";
    const resultName = currentItem?.labTest?.name || latestResult?.resultName || currentItem?.results?.[0]?.resultName || "Résultat laboratoire";
    const resultValue = resultForm.resultValue || latestResult?.resultValue || currentItem?.results?.[0]?.resultValue || "—";
    const referenceRange = resultForm.referenceRange || currentItem?.labTest?.referenceRange || "—";
    const interpretation = resultForm.interpretation || latestResult?.interpretation || currentItem?.results?.[0]?.interpretation || "—";
    const requestedAt = formatDateTime(requestDetail?.items?.[0]?.requestedAt || null);
    const displayRequestIdForPrint = displayRequestId || requestDetail.id || "—";
    const translatedRequestStatusForPrint = translatedRequestStatus;

    const resultUnit = (latestResult as LabRequestResult)?.units?.trim() || currentItem?.labTest?.unit?.trim() || "";
    const resultValueWithUnit = resultValue && resultValue !== "—" ? `${resultValue}${resultUnit ? ` ${resultUnit}` : ""}` : resultValue;
    const formattedReferenceRange = (() => {
      const normalizedRange = String(referenceRange || "").trim();
      if (!normalizedRange || normalizedRange === "—") return "—";
      if (resultUnit && !normalizedRange.toLowerCase().includes(resultUnit.toLowerCase())) {
        return `${normalizedRange} ${resultUnit}`;
      }
      return normalizedRange;
    })();
    const logoSrc = `${window.location.origin}/images/favicon.png`;

    const resultSentAt = (latestResult as LabRequestResult)?.reportedAt || currentItem?.results?.[0]?.reportedAt || requestDetail?.results?.[0]?.reportedAt || null;

    const html = `
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Bon de rendu des résultats biomédicaux - ${patientName}</title>
          <style>
            /* Print-friendly A4 with 0.44cm margins */
            @page { size: A4; margin: 0.44cm; }
            body { font-family: Arial, sans-serif; color: #111827; margin: 0; padding: 0.44cm; background: #fff; }
            /* Use box-sizing to ensure widths include padding/borders */
            .page { box-sizing: border-box; max-width: 100%; width: 100%; margin: 0 auto; padding: 6mm; border: 1px solid #d1d5db; border-radius: 8px; }
            .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; border-bottom: 2px solid #111827; padding-bottom: 10px; margin-bottom: 12px; }
            .brand-block { display: flex; align-items: center; gap: 10px; }
            .logo { width: 56px; height: 56px; object-fit: contain; }
            .document-title { font-size: 14px; font-weight: 800; text-transform: uppercase; margin: 0 0 4px; }
            .document-subtitle { font-size: 13px; color: #374151; margin: 0; }
            .meta-block { font-size: 11px; color: #4b5563; text-align: right; }
            .section { margin-bottom: 12px; }
            .section-title { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; color: #111827; margin-bottom: 6px; }
            /* Make tables slightly narrower and centered so they fit with small margins */
            table { width: calc(100% - 2px); max-width: calc(100% - 2px); margin: 0 auto 8px; border-collapse: collapse; font-size: 12px; table-layout: fixed; }
            th, td { border: 1px solid #d1d5db; padding: 6px 8px; vertical-align: top; word-break: break-word; }
            th { background: #f9fafb; font-weight: 700; text-align: left; }
            .label { width: 18%; font-weight: 700; background: #f9fafb; }
            .footer { margin-top: 16px; padding-top: 8px; border-top: 1px solid #d1d5db; display: flex; justify-content: flex-end; }
            .responsible { font-size: 13px; font-weight: 700; color: #111827; }
            @media print {
              body { padding: 0; background: #fff; }
              .page { border: none; border-radius: 0; padding: 0; }
              table { font-size: 11px; }
            }
          </style>
        </head>
        <body>
          <div class="page">
            <div class="header">
              <div class="brand-block">
                <img class="logo" src="${logoSrc}" alt="Logo clinique" />
                <div>
                  <div class="document-title">Bon de rendu des résultats biomédicaux</div>
                  <div class="document-subtitle">D7 Clinique - Service de laboratoire</div>
                </div>
              </div>
              <div class="meta-block">
                <div><strong>Document administratif</strong></div>
                <div>Imprimé le ${new Date().toLocaleDateString("fr-FR")}</div>
              </div>
            </div>

            <div class="section">
              <div class="section-title">Informations patient</div>
              <table>
                <tbody>
                  <tr>
                    <th class="label">Nom complet</th>
                    <th class="label">ID demande</th>
                    <th class="label">Statut</th>
                    <th class="label">Téléphone</th>
                    <th class="label">Email</th>
                    <th class="label">Adresse</th>
                  </tr>
                  <tr>
                    <td>${patientName}</td>
                    <td>${displayRequestIdForPrint}</td>
                    <td>${translatedRequestStatusForPrint}</td>
                    <td>${requestDetail.patient?.phone || "—"}</td>
                    <td>${requestDetail.patient?.email || "—"}</td>
                    <td>${requestDetail.patient?.address || "—"}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="section">
              <div class="section-title">Examen demandé</div>
              <table>
                <tbody>
                  <tr>
                    <th class="label">Examen</th>
                    <th class="label">Statut</th>
                    <th class="label">Demandé le</th>
                    <th class="label">Prescripteur</th>
                  </tr>
                  <tr>
                    <td>${examName}</td>
                    <td>${requestDetail.status || "—"}</td>
                    <td>${requestedAt}</td>
                    <td>${requestDetail.consultation?.provider?.displayName || requestDetail.consultation?.provider?.firstName || "—"}</td>
                  </tr>
                  <tr>
                    <td colspan="4" style="border:none;padding:6px 8px 0 8px;font-size:12px;color:#6b7280">Résultat envoyé: ${resultSentAt ? new Date(resultSentAt).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="section">
              <div class="section-title">Résultat</div>
              <table>
                <tbody>
                  <tr>
                    <th class="label">Nom du résultat</th>
                    <th class="label">Résultat</th>
                    <th class="label">Valeur de référence</th>
                    <th class="label">Interprétation</th>
                  </tr>
                  <tr>
                    <td>${resultName}</td>
                    <td>${resultValueWithUnit}</td>
                    <td>${formattedReferenceRange}</td>
                    <td>${interpretation}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="footer">
              <div class="responsible">Responsable laboratoire</div>
            </div>
          </div>
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 300);
  };

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
            <label className="mb-3 block text-sm">
              <span className="mb-2 block font-medium text-slate-700 dark:text-slate-300">Rechercher</span>
              <input
                value={recentRequestsSearch}
                onChange={(event) => setRecentRequestsSearch(event.target.value)}
                placeholder="ID, Patient, Statut, Priorité, Examen, Assigné à, Date"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
            </label>
            <DataTable
              headers={["ID", "Patient", "Statut", "Priorité", "Examen", "Assigné à", "Demandé le"]}
              rows={filteredRecentRequests.map((request) => [
                <button key={request.id} onClick={() => openRequestDetail(request.id)} className="text-left font-semibold text-emerald-700 hover:underline">
                  {request.displayId}
                </button>,
                request.patientName,
                request.status,
                request.priority,
                request.specimenType,
                request.assignedTo || "Non assigné",
                formatDate(request.requestedAt),
              ])}
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
              <div className="flex items-center gap-2">
                {canPrintResult ? (
                  <button onClick={printLaboratoryResultDocument} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                    Imprimer
                  </button>
                ) : null}
                <button onClick={() => { setRequestDetail(null); setSelectedRequest(null); }} className="rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                  <X size={18} />
                </button>
              </div>
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
                    {requestDetail?.items?.map((item, index) => (
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
                            <p className="mt-1 font-semibold text-slate-900 dark:text-white">{getLabStatusLabel(item?.status, item?.results?.[0]?.resultStatus)}</p>
                          </div>
                        </div>

                        <div>
                          <p className="text-xs uppercase tracking-wide text-slate-500">Paramètres</p>
                          <ul className="mt-2 space-y-2 text-sm text-slate-700 dark:text-slate-300">
                            {(item?.labTest?.parameterTemplates || []).length === 0 ? (
                              <li>Aucun paramètre défini.</li>
                            ) : (item.labTest?.parameterTemplates || []).map((parameter) => (
                              <li key={parameter.id} className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
                                {parameter.name} — {parameter.unit || "unité non précisée"}
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div>
                          <p className="text-xs uppercase tracking-wide text-slate-500">Échantillons</p>
                          <ul className="mt-2 space-y-2 text-sm text-slate-700 dark:text-slate-300">
                            {(() => {
                              const sampleEntries = (item?.samples && item.samples.length > 0)
                                ? item.samples.map((sample) => ({
                                    id: sample.id,
                                    name: sample.labSampleType?.name || "Échantillon",
                                    detail: sample.status || "État non précisé",
                                  }))
                                : (item?.labTest?.sampleRequirements || []).map((requirement) => ({
                                    id: requirement.id,
                                    name: requirement.labSampleType?.name || "Échantillon",
                                    detail: [
                                      requirement.volumeRequired ? `${requirement.volumeRequired}${requirement.volumeUnit ? ` ${requirement.volumeUnit}` : ""}` : null,
                                      requirement.storageCondition,
                                      requirement.instructions,
                                    ].filter(Boolean).join(" • ") || "Exigence d'échantillon",
                                  }));

                              return sampleEntries.length === 0 ? (
                                <li>Aucun échantillon associé.</li>
                              ) : sampleEntries.map((sample) => (
                                <li key={sample.id} className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
                                  <div className="font-medium">{sample.name}</div>
                                  {sample.detail ? <div className="mt-1 text-xs text-slate-500">{sample.detail}</div> : null}
                                </li>
                              ));
                            })()}
                          </ul>
                        </div>

                        <div>
                          <p className="text-xs uppercase tracking-wide text-slate-500">Exigences et consommables</p>
                          <ul className="mt-2 space-y-2 text-sm text-slate-700 dark:text-slate-300">
                            {(item?.labTest?.consumableRequirements || []).length === 0 ? (
                              <li>Aucun consommable requis.</li>
                            ) : (item.labTest?.consumableRequirements || []).map((requirement) => (
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
                        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">Nom de l'examen</label>
                        <input
                          value={resultForm.resultName}
                          readOnly
                          className="w-full rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-600 focus:border-emerald-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">Résultat</label>
                        <input
                          value={resultForm.resultValue}
                          onChange={(event) => setResultForm((current) => ({ ...current, resultValue: event.target.value }))}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">Valeur de référence</label>
                        <input
                          value={resultForm.referenceRange}
                          readOnly
                          className="w-full rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-600 focus:border-emerald-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
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