import { useEffect, useMemo, useState } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { DoctorPatient, createLabRequest, fetchDoctorVisiblePatients, formatDoctorPatientName } from "../../api/doctor";
import { apiFetch } from "../../config/api";
import { fetchLaboratoryCatalogue } from "../../api/laboratory";
import { consultationLabel, formatDateTime, hasConsultations, patientSearchText, serviceLabel } from "./medecinShared";

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

const getLabRequestViewState = (request: { status?: string | null; results?: Array<{ resultName?: string | null; resultValue?: string | null }> | null }, patientWorkflowStatus?: string | null) => {
  const hasResults = Boolean(request.results?.length);
  const normalizedWorkflow = (patientWorkflowStatus || "").toUpperCase();
  const normalizedRequestStatus = (request.status || "").toUpperCase();
  const alreadyTreatedStatuses = new Set([
    "TECHNICAL_VALIDATED",
    "BIOLOGICALLY_VALIDATED",
    "AVAILABLE",
    "SENT",
    "VERIFIED",
    "COMPLETED",
    "TECHNICAL_VALIDATION",
    "BIOLOGICAL_VALIDATION",
  ]);

  if (hasResults || alreadyTreatedStatuses.has(normalizedRequestStatus)) {
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

export default function ExamensMedecin() {
  const [patients, setPatients] = useState<DoctorPatient[]>([]);
  const [services, setServices] = useState<Array<{ id: string; name: string; type?: string | null; category?: string | null }>>([]);
  const [labTests, setLabTests] = useState<Array<{ id: string; name: string; code: string; price: string; turnaroundTimeMinutes?: number | null; section?: { name: string } | null; category?: { name: string } | null }>>([]);
  const [departments, setDepartments] = useState<Array<{ id: string; name: string; isParamedical?: boolean }>>([]);
  const [serviceUnits, setServiceUnits] = useState<Array<{ id: string; name: string; departmentId?: string }>>([]);
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [selectedConsultationId, setSelectedConsultationId] = useState("");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({ examName: "", departmentId: "", serviceId: "", labTestId: "", specimenType: "", priority: "NORMAL", notes: "" });

  const load = async () => {
    const [patientData, serviceData, catalogueData, departmentsData, serviceUnitsData] = await Promise.all([
      fetchDoctorVisiblePatients(),
      apiFetch<Array<{ id: string; name: string; type?: string | null; category?: string | null }>>("/services").catch(() => []),
      fetchLaboratoryCatalogue().catch(() => null),
      apiFetch<Array<{ id: string; name: string; isParamedical?: boolean }>>("/administration/departments").catch(() => []),
      apiFetch<Array<{ id: string; name: string; departmentId?: string }>>("/administration/service-units").catch(() => []),
    ]);
    const withConsultations = patientData.filter(hasConsultations);
    setPatients(withConsultations);
    setServices(serviceData || []);
    setDepartments(departmentsData || []);
    setServiceUnits(serviceUnitsData || []);
    setLabTests(catalogueData?.tests || []);
    setSelectedPatientId((current) => current || withConsultations[0]?.id || "");
    setSelectedConsultationId((current) => current || withConsultations[0]?.consultations?.[0]?.id || "");
  };

  useEffect(() => {
    load();
    const handler = () => load();
    window.addEventListener("d7:lab.request.created", handler);
    window.addEventListener("d7:lab.result.created", handler);
    window.addEventListener("d7:clinicalDataUpdated", handler);
    return () => {
      window.removeEventListener("d7:lab.request.created", handler);
      window.removeEventListener("d7:lab.result.created", handler);
      window.removeEventListener("d7:clinicalDataUpdated", handler);
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
  const selectedLabTest = labTests.find((test) => test.id === form.labTestId);

  const submit = async () => {
    if (!selectedConsultation || (!form.examName.trim() && !form.labTestId)) {
      setMessage("Choisissez une consultation et renseignez l'examen.");
      return;
    }
    if (!canWrite) {
      setMessage("Dossier en lecture seule: seul le medecin autorise peut demander un examen.");
      return;
    }
    await createLabRequest(selectedConsultation.id, {
      ...form,
      examName: selectedLabTest?.name || form.examName,
      specimenType: selectedLabTest?.name || form.specimenType || selectedService?.name || form.examName,
      notes: [
        form.notes,
        selectedService ? `Service paramedical: ${selectedService.name}` : "",
        selectedLabTest ? `Examen catalogue: ${selectedLabTest.name} | Prix: ${selectedLabTest.price} | Delai: ${selectedLabTest.turnaroundTimeMinutes || "-"} min` : "",
      ].filter(Boolean).join("\n"),
    });
    setForm({ examName: "", departmentId: "", serviceId: "", labTestId: "", specimenType: "", priority: "NORMAL", notes: "" });
    setMessage("Demande d'examen envoyee.");
    await load();
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 dark:bg-slate-950 sm:p-6">
      <PageMeta title="Examens medecin | D7 Clinique" description="Demandes et resultats d'examens." />
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
                    <Select label="Departement paramedical" value={form.departmentId} onChange={(value) => setForm((current) => ({ ...current, departmentId: value, serviceId: "", labTestId: "" }))} options={[["", "Choisir"], ...departments.filter((d) => d.isParamedical).map((d) => [d.id, d.name] as [string, string])]} />
                    {isDepartmentLaboratory ? (
                      <Select
                        label="Examen du catalogue laboratoire"
                        value={form.labTestId}
                        onChange={(value) => setForm((current) => ({ ...current, labTestId: value, examName: labTests.find((test) => test.id === value)?.name || current.examName }))}
                        options={[["", "Choisir un examen"], ...labTests.map((test) => [test.id, `${test.name} - ${Number(test.price || 0).toLocaleString("fr-FR")} USD - ${test.turnaroundTimeMinutes || "-"} min`] as [string, string])]}
                      />
                    ) : (
                      <Select
                        label="Service demande"
                        value={form.serviceId}
                        onChange={(value) => setForm((current) => ({ ...current, serviceId: value, examName: serviceUnits.find((s) => s.id === value)?.name || current.examName }))}
                        options={[["", "Choisir un service"], ...serviceUnits.filter((s) => s.departmentId === form.departmentId).map((s) => [s.id, s.name] as [string, string])]} 
                      />
                    )}
                    {selectedLabTest ? (
                      <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">
                        Section: {selectedLabTest.section?.name || "-"} | Categorie: {selectedLabTest.category?.name || "-"} | Prix: {Number(selectedLabTest.price || 0).toLocaleString("fr-FR")} FC | Delai: {selectedLabTest.turnaroundTimeMinutes || "-"} min
                      </div>
                    ) : null}
                    <Input label="Specimen / precision" value={form.specimenType} onChange={(value) => setForm((current) => ({ ...current, specimenType: value }))} />
                    <Select label="Priorite" value={form.priority} onChange={(value) => setForm((current) => ({ ...current, priority: value }))} options={[["NORMAL", "Normale"], ["URGENT", "Urgente"], ["CRITICAL", "Critique"]]} />
                    <Textarea label="Notes cliniques" value={form.notes} onChange={(value) => setForm((current) => ({ ...current, notes: value }))} />
                    <button disabled={!canWrite} onClick={submit} className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:bg-slate-300 disabled:text-slate-600">Envoyer la demande</button>
                  </Panel>
                  <Panel title="Demandes et resultats">
                    {(selectedPatient.labRequests || []).length === 0 ? <SmallEmpty /> : selectedPatient.labRequests?.map((request) => {
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
                              {request.results?.map((result, index) => (
                                <div key={`${request.id}-${index}`} className="rounded-lg border border-slate-200 bg-white/80 p-2.5 dark:border-slate-800 dark:bg-slate-900/70">
                                  <p className="font-medium text-slate-700 dark:text-slate-200">
                                    {result.resultName}: {result.resultValue} {result.units || ""}
                                    {result.verified ? " • Validé" : ""}
                                  </p>
                                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                                    Interprétation : {result.interpretation || "Aucune interprétation fournie."}
                                  </p>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
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
