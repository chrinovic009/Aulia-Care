import { useEffect, useMemo, useState } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { DoctorPatient, createImagingRequest, createLabRequest, fetchDoctorVisiblePatients, formatDoctorPatientName } from "../../api/doctor";
import { apiFetch } from "../../config/api";
import { fetchImagingCatalogue } from "../../api/imaging";
import { fetchLaboratoryCatalogue } from "../../api/laboratory";
import { consultationLabel, formatDateTime, hasConsultations, patientSearchText, serviceLabel } from "./medecinShared";

type LabResultParameter = {
  labTestParameter?: { name?: string | null; unit?: string | null; referenceRange?: string | null } | null;
  valueNumeric?: number | string | null;
  valueText?: string | null;
  interpretation?: string | null;
};

type DoctorLabResult = {
  resultName: string;
  resultValue: string;
  units?: string | null;
  referenceRange?: string | null;
  verified?: boolean;
  interpretation?: string | null;
  parameters?: LabResultParameter[];
};

type ImagingCatalogueItem = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  modality: string;
  preparationInstructions?: string | null;
  category?: string | null;
  availableIncidences: string[];
  supportsContrast: boolean;
  price: string;
  turnaroundTimeMinutes?: number | null;
  active: boolean;
};

const formatLabStatus = (status?: string | null) => {
  const normalized = (status || "").toUpperCase();
  const labels: Record<string, string> = {
    REQUESTED: "Demandée",
    COLLECTED: "Prélevée",
    RECEIVED: "Reçue",
    IN_ANALYSIS: "En analyse",
    TECHNICAL_VALIDATION: "Validation technique",
    BIOLOGICAL_VALIDATION: "Validation biologique",
    AVAILABLE: "Disponible",
    SENT: "Envoyée",
    COMPLETED: "Terminée",
    VERIFIED: "Vérifiée",
    CANCELLED: "Annulée",
    PENDING: "En attente",
    TECHNICAL_VALIDATED: "Validée techniquement",
    BIOLOGICALLY_VALIDATED: "Validée biologiquement",
    REJECTED: "Refusée",
    CORRECTION_REQUESTED: "Correction demandée",
  };

  return labels[normalized] || status || "Statut inconnu";
};

const getLabRequestViewState = (request: { status?: string | null; results?: Array<{ resultName?: string | null; resultValue?: string | null; units?: string | null; referenceRange?: string | null }> | null }, patientWorkflowStatus?: string | null) => {
  const hasResults = Boolean(request.results?.some((result) => (result.resultValue || "").trim()));
  const normalizedWorkflow = (patientWorkflowStatus || "").toUpperCase();
  const normalizedRequestStatus = (request.status || "").toUpperCase();
  const availableStatuses = new Set(["AVAILABLE", "SENT", "VERIFIED", "COMPLETED"]);

  if (availableStatuses.has(normalizedRequestStatus)) {
    return {
      badgeLabel: "Traité",
      badgeClassName: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
      message: hasResults ? "Le résultat est disponible." : "Cet examen a déjà été traité.",
      showResults: hasResults,
    };
  }

  if (normalizedWorkflow === "EN_ATTENTE_VALIDATION_CAISSE" || normalizedWorkflow === "EN_ATTENTE_DE_PAIEMENT") {
    return {
      badgeLabel: "En attente de paiement",
      badgeClassName: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
      message: "Le paiement doit être validé par la caisse avant que le laboratoire ne puisse traiter cet examen.",
      showResults: false,
    };
  }

  return {
    badgeLabel: "En cours de traitement",
    badgeClassName: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
    message: "L'examen a été transmis au laboratoire et est en cours de traitement.",
    showResults: false,
  };
};

const formatLabResultParameter = (parameter: LabResultParameter) => {
  const name = parameter.labTestParameter?.name || "Paramètre";
  const value = parameter.valueNumeric?.toString() || parameter.valueText || "Non renseigné";
  const unit = parameter.labTestParameter?.unit?.trim() || "";
  const reference = parameter.labTestParameter?.referenceRange?.trim() || "";
  const interpretation = parameter.interpretation ? ` • ${parameter.interpretation}` : "";
  const referenceText = reference ? ` | Réf: ${reference}${unit && !reference.toLowerCase().includes(unit.toLowerCase()) ? ` ${unit}` : ""}` : unit ? ` ${unit}` : "";
  return `${name}: ${value}${referenceText}${interpretation}`;
};

const formatLabResultTextWithReference = (result: DoctorLabResult) => {
  if (Array.isArray(result.parameters) && result.parameters.length > 0) {
    return result.parameters.map((parameter) => formatLabResultParameter(parameter)).join("\n");
  }

  const resultValue = result.resultValue?.trim() || "Non renseigné";
  const units = result.units?.trim();
  const valueLine = `${result.resultName || "Résultat"}: ${resultValue}${units ? ` ${units}` : ""}`;
  const reference = result.referenceRange?.trim();
  if (!reference) {
    return valueLine;
  }
  const hasUnitAlready = Boolean(units && reference.toLowerCase().includes(units.toLowerCase()));
  return `${valueLine}\nRéférence: ${reference}${!hasUnitAlready && units ? ` ${units}` : ""}`;
};

const isNfsExam = (name?: string | null) =>
  Boolean(/(^|\s)(nfs|h[eé]mogramme|num[eé]ration formule sanguine)(\s|$)/i.test(name || ""));

export default function ExamensMedecin() {
  const [patients, setPatients] = useState<DoctorPatient[]>([]);
  const [services, setServices] = useState<Array<{ id: string; name: string; type?: string | null; category?: string | null }>>([]);
  const [labTests, setLabTests] = useState<Array<{ id: string; name: string; code: string; price: string; turnaroundTimeMinutes?: number | null; section?: { name: string } | null; category?: { name: string } | null }>>([]);
  const [imagingCatalogue, setImagingCatalogue] = useState<ImagingCatalogueItem[]>([]);
  const [departments, setDepartments] = useState<Array<{ id: string; name: string; isParamedical?: boolean; type?: string | null }>>([]);
  const [serviceUnits, setServiceUnits] = useState<Array<{ id: string; name: string; departmentId?: string }>>([]);
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [selectedConsultationId, setSelectedConsultationId] = useState("");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const initialForm = { examName: "", imagingCatalogueId: "", bodyPart: "", urgency: "ROUTINE", contrastAgentUsed: false, contrastDetails: "", selectedIncidences: "", protocolNotes: "", notes: "", departmentId: "", serviceId: "", labTestId: "", specimenType: "", priority: "NORMAL" };
  const [form, setForm] = useState(initialForm);
  const [selectedLabTestIds, setSelectedLabTestIds] = useState<string[]>([]);

  const load = async () => {
    const [patientData, serviceData, imagingCatalogueData, catalogueData, departmentsData, serviceUnitsData] = await Promise.all([
      fetchDoctorVisiblePatients(),
      apiFetch<Array<{ id: string; name: string; type?: string | null; category?: string | null }>>("/services").catch(() => []),
      fetchImagingCatalogue().catch(() => []),
      fetchLaboratoryCatalogue().catch(() => null),
      apiFetch<Array<{ id: string; name: string; isParamedical?: boolean }>>("/administration/departments").catch(() => []),
      apiFetch<Array<{ id: string; name: string; departmentId?: string }>>("/administration/service-units").catch(() => []),
    ]);
    const withConsultations = patientData.filter(hasConsultations);
    setPatients(withConsultations);
    setServices(serviceData || []);
    setImagingCatalogue(imagingCatalogueData || []);
    setDepartments(departmentsData || []);
    setServiceUnits(serviceUnitsData || []);
    setLabTests(catalogueData?.tests || []);
    setSelectedPatientId((current) => current || withConsultations[0]?.id || "");
    setSelectedConsultationId((current) => current || withConsultations[0]?.consultations?.[0]?.id || "");
  };

  useEffect(() => {
    load();
    const handler = () => load();
    window.addEventListener("aulia:lab.request.created", handler);
    window.addEventListener("aulia:lab.result.created", handler);
    window.addEventListener("aulia:clinicalDataUpdated", handler);
    return () => {
      window.removeEventListener("aulia:lab.request.created", handler);
      window.removeEventListener("aulia:lab.result.created", handler);
      window.removeEventListener("aulia:clinicalDataUpdated", handler);
    };
  }, []);

  const filteredPatients = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return patients.filter((patient) => !normalized || patientSearchText(patient).includes(normalized));
  }, [patients, query]);

  const selectedPatient = patients.find((patient) => patient.id === selectedPatientId) || filteredPatients[0] || null;
  const selectedConsultation = selectedPatient?.consultations?.find((consultation) => consultation.id === selectedConsultationId) || selectedPatient?.consultations?.[0] || null;
  const canWrite = Boolean(selectedPatient?.access?.canWrite);
  const selectedService = serviceUnits.find((s) => s.id === form.serviceId) || services.find((service) => service.id === form.serviceId);
  const isDepartmentLaboratory = Boolean(departments.find((d) => d.id === form.departmentId && d.name === "Laboratoire Medical"));
  const selectedLabTests = useMemo(() => labTests.filter((test) => selectedLabTestIds.includes(test.id)), [labTests, selectedLabTestIds]);
  const selectedImagingItem = imagingCatalogue.find((item) => item.id === form.imagingCatalogueId) || null;
  const paramedicalDepartments = useMemo(
    () => departments.filter((d) => d.isParamedical && !/pharmacie|pharmacy/i.test(d.name || "")),
    [departments],
  );

  const submit = async () => {
    const isImagingRequest = Boolean(form.imagingCatalogueId || form.examName.trim());
    const isLabRequest = isDepartmentLaboratory ? selectedLabTestIds.length > 0 : Boolean(form.labTestId || form.examName.trim());

    if (!selectedConsultation || (!isLabRequest && !isImagingRequest)) {
      setMessage("Choisissez une consultation et renseignez au moins un examen.");
      return;
    }
    if (!canWrite) {
      setMessage("Dossier en lecture seule: seul le medecin autorise peut demander un examen.");
      return;
    }

    if (form.imagingCatalogueId) {
      await createImagingRequest(selectedConsultation.id, {
        imagingCatalogueId: form.imagingCatalogueId,
        examName: form.examName,
        bodyPart: form.bodyPart,
        urgency: form.urgency,
        contrastAgentUsed: form.contrastAgentUsed,
        contrastDetails: form.contrastDetails,
        selectedIncidences: form.selectedIncidences.split(',').map((item) => item.trim()).filter(Boolean),
        protocolNotes: form.protocolNotes,
        notes: form.notes,
      });
      setForm(initialForm);
      setSelectedLabTestIds([]);
      setMessage("Demande d'imagerie envoyee.");
    } else {
      const labTestIds = isDepartmentLaboratory ? selectedLabTestIds : (form.labTestId ? [form.labTestId] : []);

      await createLabRequest(selectedConsultation.id, {
        ...form,
        labTestIds,
        examName: selectedLabTests.length > 0 ? selectedLabTests.map((test) => test.name).join(", ") : form.examName,
        specimenType: selectedLabTests.length > 0 ? selectedLabTests.map((test) => test.name).join(", ") : (form.specimenType || selectedService?.name || form.examName),
        notes: [
          form.notes,
          selectedService ? `Service paramedical: ${selectedService.name}` : "",
          selectedLabTests.length > 0 ? `Examens catalogue: ${selectedLabTests.map((test) => test.name).join(", ")}` : "",
        ].filter(Boolean).join("\n"),
      });
      setForm(initialForm);
      setSelectedLabTestIds([]);
      setMessage("Demande d'examen envoyee.");
    }

    await load();
  };

  const recentLabRequests = useMemo(() => {
    const requests = (selectedPatient?.labRequests || []).slice();
    requests.sort((a, b) => new Date(b.requestedAt || (b as any).createdAt || 0).getTime() - new Date(a.requestedAt || (a as any).createdAt || 0).getTime());
    return requests.slice(0, 5);
  }, [selectedPatient?.labRequests]);

  const recentImagingRequests = useMemo(() => {
    const requests = (selectedPatient?.imagingRequests || []).slice();
    requests.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    return requests.slice(0, 5);
  }, [selectedPatient?.imagingRequests]);

  return (
    <div className="min-h-screen bg-slate-50 p-4 dark:bg-slate-950 sm:p-6">
      <PageMeta title="Examens medecin | Aulia Care" description="Demandes et resultats d'examens." />
      <PageBreadcrumb pageTitle="Examens demandes" />
      <Header title="Examens complementaires" subtitle="Choisir une consultation, demander un examen, puis suivre les resultats." />
      {patients.length === 0 ? <EmptyState /> : (
        <div className="mt-6 grid gap-6 xl:grid-cols-[380px_1fr]">
          <PatientList patients={filteredPatients} selectedId={selectedPatient?.id || ""} query={query} onQuery={setQuery} onSelect={(patient) => { setSelectedPatientId(patient.id); setSelectedConsultationId(patient.consultations?.[0]?.id || ""); }} />
          <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            {message && <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">{message}</div>}
            {selectedPatient && selectedConsultation ? (
              <>
                <PatientHeader patient={selectedPatient} />
                <div className="mt-5 grid gap-4 xl:grid-cols-2">
                  <Panel title="Nouvelle demande">
                    <Select label="Consultation" value={selectedConsultation.id} onChange={setSelectedConsultationId} options={(selectedPatient.consultations || []).map((consultation) => [consultation.id, consultationLabel(consultation)] as [string, string])} />
                    <Select label="Departement paramedical" value={form.departmentId} onChange={(value) => setForm((current) => ({ ...current, departmentId: value, serviceId: "", labTestId: "", imagingCatalogueId: "" }))} options={[ ["", "Choisir"], ...paramedicalDepartments.map((d) => [d.id, d.name] as [string, string]) ]} />
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">Examen d'imagerie</span>
                      <select
                        value={form.imagingCatalogueId}
                        onChange={(event) => {
                          const value = event.target.value;
                          const selected = imagingCatalogue.find((item) => item.id === value) || null;
                          setForm((current) => ({
                            ...current,
                            imagingCatalogueId: value,
                            examName: selected?.name || current.examName,
                            bodyPart: selected?.name || current.bodyPart,
                          }));
                        }}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                      >
                        <option value="">Choisir un examen d'imagerie</option>
                        {imagingCatalogue.map((item) => (
                          <option key={item.id} value={item.id}>{`${item.name} (${item.modality}) - ${Number(item.price || 0).toLocaleString('fr-FR')} CDF`}</option>
                        ))}
                      </select>
                    </label>
                    {selectedImagingItem ? (
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-950">
                        <p className="font-semibold text-slate-900 dark:text-white">{selectedImagingItem.name}</p>
                        <p className="text-xs text-slate-500">{selectedImagingItem.description || 'Aucune description disponible.'}</p>
                        <p className="mt-2 text-xs text-slate-500">Modalité: {selectedImagingItem.modality}</p>
                        <p className="text-xs text-slate-500">Catégorie: {selectedImagingItem.category || 'Général'}</p>
                        <p className="text-xs text-slate-500">Incidences possibles: {selectedImagingItem.availableIncidences.join(', ') || 'Aucune'}</p>
                        <p className="text-xs text-slate-500">Contraste autorisé: {selectedImagingItem.supportsContrast ? 'Oui' : 'Non'}</p>
                      </div>
                    ) : null}
                    {selectedImagingItem ? (
                      <>
                        <Input label="Partie du corps" value={form.bodyPart} onChange={(value) => setForm((current) => ({ ...current, bodyPart: value }))} />
                        <Select label="Urgence" value={form.urgency} onChange={(value) => setForm((current) => ({ ...current, urgency: value }))} options={[['ROUTINE', 'Routine'], ['URGENT', 'Urgent'], ['CRITICAL', 'Critique']]} />
                        <label className="block text-sm">
                          <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">Incidences demandées</span>
                          <input
                            value={form.selectedIncidences}
                            onChange={(event) => setForm((current) => ({ ...current, selectedIncidences: event.target.value }))}
                            placeholder="Ex: Face, Profil gauche"
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          />
                        </label>
                        <label className="flex items-center gap-3 text-sm">
                          <input
                            type="checkbox"
                            checked={form.contrastAgentUsed}
                            onChange={(event) => setForm((current) => ({ ...current, contrastAgentUsed: event.target.checked }))}
                            className="h-4 w-4 rounded border-slate-300 text-slate-900"
                          />
                          <span className="font-medium text-slate-600 dark:text-slate-300">Contraste requis</span>
                        </label>
                        {form.contrastAgentUsed ? (
                          <Textarea label="Détails contraste" value={form.contrastDetails} onChange={(value) => setForm((current) => ({ ...current, contrastDetails: value }))} />
                        ) : null}
                        <Textarea label="Protocole / remarques" value={form.protocolNotes} onChange={(value) => setForm((current) => ({ ...current, protocolNotes: value }))} />
                      </>
                    ) : null}
                    {isDepartmentLaboratory ? (
                      <div className="space-y-2">
                        <label className="block text-sm">
                          <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">Examen du catalogue laboratoire</span>
                          <select
                            value=""
                            onChange={(event) => {
                              const value = event.target.value;
                              if (!value) return;
                              setSelectedLabTestIds((current) => current.includes(value) ? current : [...current, value]);
                              event.target.value = "";
                            }}
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          >
                            <option value="">Choisir un examen</option>
                            {labTests.map((test) => (
                              <option key={test.id} value={test.id}>{`${test.name} - ${Number(test.price || 0).toLocaleString('fr-FR')} CDF - ${test.turnaroundTimeMinutes || '-'} min`}</option>
                            ))}
                          </select>
                        </label>
                        {selectedLabTests.length > 0 ? (
                          <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-950">
                            {selectedLabTests.map((test) => (
                              <div key={test.id} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 dark:bg-slate-900">
                                <div>
                                  <p className="font-medium text-slate-800 dark:text-slate-100">{test.name}</p>
                                  <p className="text-xs text-slate-500">{test.section?.name || '-'} • {test.category?.name || '-'}</p>
                                </div>
                                <button type="button" onClick={() => setSelectedLabTestIds((current) => current.filter((id) => id !== test.id))} className="text-xs font-semibold text-rose-600">Retirer</button>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <Select
                        label="Service demande"
                        value={form.serviceId}
                        onChange={(value) => setForm((current) => ({ ...current, serviceId: value, examName: serviceUnits.find((s) => s.id === value)?.name || current.examName }))}
                        options={[["", "Choisir un service"], ...serviceUnits.filter((s) => s.departmentId === form.departmentId).map((s) => [s.id, s.name] as [string, string])]} 
                      />
                    )}
                    {isDepartmentLaboratory && selectedLabTests.length > 0 ? (
                      <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">
                        {selectedLabTests.map((test) => (
                          <div key={test.id} className="mb-2 last:mb-0">
                            <span className="font-semibold">{test.name}</span> — Section: {test.section?.name || "-"} | Catégorie: {test.category?.name || "-"} | Prix: {Number(test.price || 0).toLocaleString("fr-FR")} CDF | Délai: {test.turnaroundTimeMinutes || "-"} min
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <Input label="Specimen / precision" value={form.specimenType} onChange={(value) => setForm((current) => ({ ...current, specimenType: value }))} />
                    <Select label="Priorite" value={form.priority} onChange={(value) => setForm((current) => ({ ...current, priority: value }))} options={[["NORMAL", "Normale"], ["URGENT", "Urgente"], ["CRITICAL", "Critique"]]} />
                    <Textarea label="Notes cliniques" value={form.notes} onChange={(value) => setForm((current) => ({ ...current, notes: value }))} />
                    <button disabled={!canWrite} onClick={submit} className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:bg-slate-300 disabled:text-slate-600">Envoyer la demande</button>
                  </Panel>
                  <Panel title="Demandes et resultats">
                    {(selectedPatient.labRequests || selectedPatient.imagingRequests || []).length === 0 ? <SmallEmpty /> : (
                      <div className="space-y-4">
                        {recentImagingRequests.length > 0 ? (
                          <div className="space-y-3">
                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-950">
                              <p className="font-semibold text-slate-900 dark:text-white">Demandes d'imagerie récentes</p>
                            </div>
                            {recentImagingRequests.map((request) => (
                              <div key={request.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-950">
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                  <div>
                                    <p className="font-semibold text-slate-900 dark:text-white">{request.modality} - {request.bodyPart || 'Imagerie'}</p>
                                    <p className="mt-1 text-xs text-slate-500">{formatDateTime(request.createdAt)}</p>
                                  </div>
                                  <span className="inline-flex rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">{request.status || 'REQUESTED'}</span>
                                </div>
                                {request.report?.impression ? (
                                  <p className="mt-3 text-slate-600 dark:text-slate-300">Impression: {request.report.impression}</p>
                                ) : (
                                  <p className="mt-3 text-slate-600 dark:text-slate-300">Aucun rapport disponible.</p>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : null}
                        {recentLabRequests.length > 0 ? (
                          <div className="space-y-3">
                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-950">
                              <p className="font-semibold text-slate-900 dark:text-white">Demandes de laboratoire récentes</p>
                            </div>
                            {recentLabRequests.map((request) => {
                              const viewState = getLabRequestViewState(request, selectedPatient.workflowStatus);
                              return (
                                <div key={request.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-950">
                                  <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div>
                                      <p className="font-semibold text-slate-900 dark:text-white">{request.specimenType || "Examen"}</p>
                                      <p className="mt-1 text-xs text-slate-500">{formatDateTime(request.requestedAt)}</p>
                                    </div>
                                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${viewState.badgeClassName}`}>
                                      {viewState.badgeLabel}
                                    </span>
                                  </div>
                                  <p className="mt-2 inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                    {formatLabStatus(request.status)}
                                  </p>
                                  <p className="mt-3 text-slate-600 dark:text-slate-300">{viewState.message}</p>
                                  {viewState.showResults ? (
                                    <div className="mt-3 space-y-2">
                                      {(() => {
                                        const examName = (request as any).examName || request.specimenType || "";
                                        const isNfsRequest = isNfsExam(examName) || Boolean(request.results?.some((r: any) => Array.isArray(r.parameters) && r.parameters.length > 0));
                                        if (isNfsRequest) {
                                          const params = (request.results || []).flatMap((r: any) => r.parameters || []);
                                          if (params.length === 0) return <p className="text-sm text-slate-500">Aucun sous-examen NFS disponible.</p>;
                                          return params.map((p: any, idx: number) => (
                                            <div key={`${request.id}-param-${idx}`} className="rounded-lg border border-slate-200 bg-white/80 p-2.5 dark:border-slate-800 dark:bg-slate-900/70">
                                              <p className="font-medium text-slate-700 dark:text-slate-200 whitespace-pre-line">{formatLabResultParameter(p)}</p>
                                            </div>
                                          ));
                                        }
                                        return request.results?.map((result, index) => (
                                          <div key={`${request.id}-${index}`} className="rounded-lg border border-slate-200 bg-white/80 p-2.5 dark:border-slate-800 dark:bg-slate-900/70">
                                            <p className="font-medium text-slate-700 dark:text-slate-200 whitespace-pre-line">
                                              {formatLabResultTextWithReference(result)}
                                              {result.verified ? " • Validé" : ""}
                                            </p>
                                            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Interprétation : {result.interpretation || "Aucune interprétation fournie."}</p>
                                          </div>
                                        ));
                                      })()}
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    )}
                  </Panel>
                </div>
              </>
            ) : <SmallEmpty />}
          </section>
        </div>
      )}
    </div>
  );
}

function Header({ title, subtitle }: { title: string; subtitle: string }) {
  return <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"><h1 className="text-2xl font-semibold text-slate-900 dark:text-white">{title}</h1><p className="mt-2 text-sm text-slate-500">{subtitle}</p></section>;
}

function PatientList({ patients, selectedId, query, onQuery, onSelect }: { patients: DoctorPatient[]; selectedId: string; query: string; onQuery: (value: string) => void; onSelect: (patient: DoctorPatient) => void }) {
  return <aside className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Rechercher patient..." className="mb-4 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white" /> <div className="space-y-3">{patients.map((patient) => <button key={patient.id} onClick={() => onSelect(patient)} className={`w-full rounded-lg border p-3 text-left ${selectedId === patient.id ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"}`}><p className="font-semibold text-slate-900 dark:text-white">{formatDoctorPatientName(patient)}</p><p className="mt-1 text-xs text-slate-500">{serviceLabel(patient)}</p></button>)}</div></aside>;
}

function PatientHeader({ patient }: { patient: DoctorPatient }) {
  return <div className="flex flex-col gap-2 border-b border-slate-200 pb-4 dark:border-slate-800"><h2 className="text-xl font-semibold text-slate-900 dark:text-white">{formatDoctorPatientName(patient)}</h2><p className="text-sm text-slate-500">{serviceLabel(patient)} - {patient.workflowStatus}</p><span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${patient.access?.canWrite ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}`}>{patient.access?.canWrite ? "Ecriture autorisee" : "Lecture seule"}</span></div>;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800"><h3 className="font-semibold text-slate-900 dark:text-white">{title}</h3><div className="mt-3 space-y-3">{children}</div></div>;
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block text-sm"><span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>;
}

function Textarea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block text-sm"><span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">{label}</span><textarea value={value} onChange={(event) => onChange(event.target.value)} rows={3} className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>;
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<[string, string]> }) {
  return <label className="block text-sm"><span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700 dark:bg-slate-950 dark:text-white">{options.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>;
}

function EmptyState() {
  return <div className="mt-6 rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Aucune consultation disponible. Cet onglet apparait utilement lorsqu'au moins une consultation existe.</div>;
}

function SmallEmpty() {
  return <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500 dark:bg-slate-950">Aucune donnee disponible.</p>;
}
