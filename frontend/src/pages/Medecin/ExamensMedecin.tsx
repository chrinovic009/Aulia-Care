import { useEffect, useMemo, useState } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { DoctorPatient, createLabRequest, fetchDoctorVisiblePatients, formatDoctorPatientName } from "../../api/doctor";
import { apiFetch } from "../../config/api";
import { consultationLabel, formatDateTime, hasConsultations, patientSearchText, serviceLabel } from "./medecinShared";

export default function ExamensMedecin() {
  const [patients, setPatients] = useState<DoctorPatient[]>([]);
  const [services, setServices] = useState<Array<{ id: string; name: string; type?: string | null; category?: string | null }>>([]);
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [selectedConsultationId, setSelectedConsultationId] = useState("");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({ examName: "", serviceId: "", specimenType: "", priority: "NORMAL", notes: "" });

  const load = async () => {
    const [patientData, serviceData] = await Promise.all([
      fetchDoctorVisiblePatients(),
      apiFetch<Array<{ id: string; name: string; type?: string | null; category?: string | null }>>("/services").catch(() => []),
    ]);
    const withConsultations = patientData.filter(hasConsultations);
    setPatients(withConsultations);
    setServices(serviceData || []);
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

  const examServices = useMemo(() => {
    const keywords = ["laboratoire", "radio", "imagerie", "echographie", "échographie", "scanner", "irm", "mammographie", "analyse", "pathologie"];
    return services.filter((service) => keywords.some((keyword) => [service.name, service.type, service.category].filter(Boolean).join(" ").toLowerCase().includes(keyword)));
  }, [services]);

  const filteredPatients = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return patients.filter((patient) => !normalized || patientSearchText(patient).includes(normalized));
  }, [patients, query]);

  const selectedPatient = patients.find((patient) => patient.id === selectedPatientId) || filteredPatients[0] || null;
  const selectedConsultation = selectedPatient?.consultations?.find((consultation) => consultation.id === selectedConsultationId) || selectedPatient?.consultations?.[0] || null;
  const canWrite = Boolean(selectedPatient?.access?.canWrite);

  const submit = async () => {
    if (!selectedConsultation || !form.examName.trim()) {
      setMessage("Choisissez une consultation et renseignez l'examen.");
      return;
    }
    if (!canWrite) {
      setMessage("Dossier en lecture seule: seul le medecin autorise peut demander un examen.");
      return;
    }
    const selectedService = services.find((service) => service.id === form.serviceId);
    await createLabRequest(selectedConsultation.id, {
      ...form,
      specimenType: selectedService?.name || form.specimenType || form.examName,
      notes: [form.notes, selectedService ? `Service paramedical: ${selectedService.name}` : ""].filter(Boolean).join("\n"),
    });
    setForm({ examName: "", serviceId: "", specimenType: "", priority: "NORMAL", notes: "" });
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
                    <Input label="Examen demande" value={form.examName} onChange={(value) => setForm((current) => ({ ...current, examName: value }))} />
                    <Select label="Service paramedical" value={form.serviceId} onChange={(value) => setForm((current) => ({ ...current, serviceId: value }))} options={[["", "Choisir"], ...examServices.map((service) => [service.id, service.name] as [string, string])]} />
                    <Input label="Specimen / precision" value={form.specimenType} onChange={(value) => setForm((current) => ({ ...current, specimenType: value }))} />
                    <Select label="Priorite" value={form.priority} onChange={(value) => setForm((current) => ({ ...current, priority: value }))} options={[["NORMAL", "Normale"], ["URGENT", "Urgente"], ["CRITICAL", "Critique"]]} />
                    <Textarea label="Notes cliniques" value={form.notes} onChange={(value) => setForm((current) => ({ ...current, notes: value }))} />
                    <button disabled={!canWrite} onClick={submit} className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:bg-slate-300 disabled:text-slate-600">Envoyer la demande</button>
                  </Panel>
                  <Panel title="Demandes et resultats">
                    {(selectedPatient.labRequests || []).length === 0 ? <SmallEmpty /> : selectedPatient.labRequests?.map((request) => (
                      <div key={request.id} className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-950">
                        <p className="font-semibold text-slate-900 dark:text-white">{request.specimenType || "Examen"} - {request.status}</p>
                        <p className="mt-1 text-xs text-slate-500">{formatDateTime(request.requestedAt)}</p>
                        <p className="mt-2 text-slate-600 dark:text-slate-300">{request.results?.length ? request.results.map((result) => `${result.resultName}: ${result.resultValue} ${result.units || ""}${result.verified ? " (verifie)" : ""}`).join(", ") : "Resultat en attente."}</p>
                      </div>
                    ))}
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
