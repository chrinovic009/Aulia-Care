import { useEffect, useMemo, useState, type ReactNode } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { DoctorPatient, fetchDoctorVisiblePatients, formatDoctorPatientName } from "../../api/doctor";
import { apiFetch } from "../../config/api";
import { consultationLabel, formatDateTime, hasConsultations, patientSearchText, serviceLabel } from "./medecinShared";

type OperatingRoom = {
  id: string;
  name: string;
  location?: string | null;
  capacity?: number;
  active?: boolean;
};

type Surgery = {
  id: string;
  patientId: string;
  status: string;
  procedureName: string;
  indication: string;
  scheduledAt?: string | null;
  findings?: string | null;
  postoperativePlan?: string | null;
  patient?: { firstName?: string | null; lastName?: string | null; middleName?: string | null } | null;
  consultation?: { chiefComplaint?: string | null; createdAt?: string | null; provider?: { displayName?: string | null } | null } | null;
  operatingRoom?: OperatingRoom | null;
  surgeon?: { displayName?: string | null } | null;
};

export default function BlocOperatoireMedecin() {
  const [patients, setPatients] = useState<DoctorPatient[]>([]);
  const [rooms, setRooms] = useState<OperatingRoom[]>([]);
  const [surgeries, setSurgeries] = useState<Surgery[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [selectedConsultationId, setSelectedConsultationId] = useState("");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({ operatingRoomId: "", procedureName: "", indication: "", scheduledAt: "", postoperativePlan: "" });

  const load = async () => {
    const [patientData, roomData, surgeryData] = await Promise.all([
      fetchDoctorVisiblePatients(),
      apiFetch<OperatingRoom[]>("/surgery/operating-rooms/all").catch(() => []),
      apiFetch<Surgery[]>("/surgery").catch(() => []),
    ]);
    const withConsultations = patientData.filter(hasConsultations);
    setPatients(withConsultations);
    setRooms(roomData);
    setSurgeries(surgeryData);
    setSelectedPatientId((current) => current || withConsultations[0]?.id || "");
    setSelectedConsultationId((current) => current || withConsultations[0]?.consultations?.[0]?.id || "");
    setForm((current) => ({ ...current, operatingRoomId: current.operatingRoomId || roomData[0]?.id || "" }));
  };

  useEffect(() => {
    load();
    const handler = () => load();
    window.addEventListener("d7:surgery.updated", handler);
    window.addEventListener("d7:clinicalDataUpdated", handler);
    return () => {
      window.removeEventListener("d7:surgery.updated", handler);
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

  const submit = async () => {
    if (!selectedPatient || !selectedConsultation || !form.procedureName.trim() || !form.indication.trim()) {
      setMessage("Choisissez une consultation, renseignez l'intervention et l'indication.");
      return;
    }
    if (!canWrite) {
      setMessage("Dossier en lecture seule: seul le medecin autorise peut programmer le bloc.");
      return;
    }
    await apiFetch("/surgery", {
      method: "POST",
      body: JSON.stringify({
        patientId: selectedPatient.id,
        consultationId: selectedConsultation.id,
        operatingRoomId: form.operatingRoomId || undefined,
        procedureName: form.procedureName,
        indication: form.indication,
        scheduledAt: form.scheduledAt || undefined,
        postoperativePlan: form.postoperativePlan || undefined,
      }),
    });
    setForm({ operatingRoomId: rooms[0]?.id || "", procedureName: "", indication: "", scheduledAt: "", postoperativePlan: "" });
    setMessage("Intervention planifiee et ajoutee au dossier medical.");
    await load();
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 dark:bg-slate-950 sm:p-6">
      <PageMeta title="Bloc operatoire medecin | D7 Clinique" description="Planification des interventions chirurgicales." />
      <PageBreadcrumb pageTitle="Bloc operatoire" />
      <Header title="Bloc operatoire" subtitle="Planifier une intervention depuis une consultation et suivre les actes chirurgicaux." />

      <div className="mt-6 grid gap-6 xl:grid-cols-[380px_1fr]">
        <PatientList patients={filteredPatients} selectedId={selectedPatient?.id || ""} query={query} onQuery={setQuery} onSelect={(patient) => { setSelectedPatientId(patient.id); setSelectedConsultationId(patient.consultations?.[0]?.id || ""); }} />

        <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          {message && <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">{message}</div>}
          {selectedPatient ? (
            <>
              <PatientHeader patient={selectedPatient} />
              <div className="mt-5 grid gap-4 xl:grid-cols-2">
                <Panel title="Programmer une intervention">
                  <Select label="Consultation source" value={selectedConsultation?.id || ""} onChange={setSelectedConsultationId} options={(selectedPatient.consultations || []).map((consultation) => [consultation.id, consultationLabel(consultation)] as [string, string])} />
                  <Select label="Salle operatoire" value={form.operatingRoomId} onChange={(value) => setForm((current) => ({ ...current, operatingRoomId: value }))} options={[["", "Salle non assignee"], ...rooms.map((room) => [room.id, `${room.name}${room.location ? ` - ${room.location}` : ""}`] as [string, string])]} />
                  <Input label="Acte chirurgical" value={form.procedureName} onChange={(value) => setForm((current) => ({ ...current, procedureName: value }))} />
                  <Input label="Date programmee" type="datetime-local" value={form.scheduledAt} onChange={(value) => setForm((current) => ({ ...current, scheduledAt: value }))} />
                  <Textarea label="Indication operatoire" value={form.indication} onChange={(value) => setForm((current) => ({ ...current, indication: value }))} />
                  <Textarea label="Plan post-operatoire" value={form.postoperativePlan} onChange={(value) => setForm((current) => ({ ...current, postoperativePlan: value }))} />
                  <button disabled={!canWrite || !selectedConsultation} onClick={submit} className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:bg-slate-300 disabled:text-slate-600">Programmer</button>
                </Panel>

                <Panel title="Interventions du patient">
                  {surgeries.filter((surgery) => surgery.patientId === selectedPatient.id).length === 0 ? <SmallEmpty /> : surgeries.filter((surgery) => surgery.patientId === selectedPatient.id).map((surgery) => <SurgeryCard key={surgery.id} surgery={surgery} />)}
                </Panel>
              </div>

              <Panel title="Planning du bloc">
                {surgeries.length === 0 ? <SmallEmpty /> : surgeries.map((surgery) => <SurgeryCard key={surgery.id} surgery={surgery} />)}
              </Panel>
            </>
          ) : <SmallEmpty />}
        </section>
      </div>
    </div>
  );
}

function SurgeryCard({ surgery }: { surgery: Surgery }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-950">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="font-semibold text-slate-900 dark:text-white">{surgery.procedureName}</p>
          <p className="mt-1 text-xs text-slate-500">{patientName(surgery.patient)} - {surgery.operatingRoom?.name || "Salle non assignee"}</p>
        </div>
        <Badge>{surgery.status}</Badge>
      </div>
      <p className="mt-2 text-slate-600 dark:text-slate-300">{surgery.indication}</p>
      <p className="mt-2 text-xs text-slate-500">Programme: {surgery.scheduledAt ? formatDateTime(surgery.scheduledAt) : "Non programme"} | Chirurgien: {surgery.surgeon?.displayName || "Non renseigne"}</p>
      {surgery.postoperativePlan && <p className="mt-2 text-slate-600 dark:text-slate-300">Plan post-op: {surgery.postoperativePlan}</p>}
    </div>
  );
}

function patientName(patient?: Surgery["patient"]) {
  return [patient?.firstName, patient?.middleName, patient?.lastName].filter(Boolean).join(" ") || "Patient";
}

function Header({ title, subtitle }: { title: string; subtitle: string }) {
  return <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"><h1 className="text-2xl font-semibold text-slate-900 dark:text-white">{title}</h1><p className="mt-2 text-sm text-slate-500">{subtitle}</p></section>;
}

function PatientList({ patients, selectedId, query, onQuery, onSelect }: { patients: DoctorPatient[]; selectedId: string; query: string; onQuery: (value: string) => void; onSelect: (patient: DoctorPatient) => void }) {
  return <aside className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Rechercher patient..." className="mb-4 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white" /><div className="space-y-3">{patients.map((patient) => <button key={patient.id} onClick={() => onSelect(patient)} className={`w-full rounded-lg border p-3 text-left ${selectedId === patient.id ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"}`}><p className="font-semibold text-slate-900 dark:text-white">{formatDoctorPatientName(patient)}</p><p className="mt-1 text-xs text-slate-500">{serviceLabel(patient)} - {patient.workflowStatus}</p></button>)}</div></aside>;
}

function PatientHeader({ patient }: { patient: DoctorPatient }) {
  return <div className="flex flex-col gap-2 border-b border-slate-200 pb-4 dark:border-slate-800"><h2 className="text-xl font-semibold text-slate-900 dark:text-white">{formatDoctorPatientName(patient)}</h2><p className="text-sm text-slate-500">{serviceLabel(patient)} - {patient.workflowStatus}</p><span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${patient.access?.canWrite ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}`}>{patient.access?.canWrite ? "Ecriture autorisee" : "Lecture seule"}</span></div>;
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <div className="mt-4 rounded-lg border border-slate-200 p-4 dark:border-slate-800"><h3 className="font-semibold text-slate-900 dark:text-white">{title}</h3><div className="mt-3 space-y-3">{children}</div></div>;
}

function Badge({ children }: { children: ReactNode }) {
  return <span className="w-fit rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">{children}</span>;
}

function Input({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <label className="block text-sm"><span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>;
}

function Textarea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block text-sm"><span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">{label}</span><textarea value={value} onChange={(event) => onChange(event.target.value)} rows={3} className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>;
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<[string, string]> }) {
  return <label className="block text-sm"><span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700 dark:bg-slate-950 dark:text-white">{options.length ? options.map(([key, label]) => <option key={key} value={key}>{label}</option>) : <option value="">Aucune option</option>}</select></label>;
}

function SmallEmpty() {
  return <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500 dark:bg-slate-950">Aucune donnee disponible.</p>;
}
