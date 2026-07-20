import { useEffect, useMemo, useState, type ReactNode } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { DoctorPatient, fetchDoctorVisiblePatients, formatDoctorPatientName } from "../../api/doctor";
import { apiFetch } from "../../config/api";
import { useAuth } from "../../context/AuthContext";
import { consultationLabel, formatDateTime, hasConsultations, patientSearchText, serviceLabel } from "./medecinShared";
import { getBedSelectionState, type BedSelectionRoom } from "./hospitalizationBedSelection";

const formatVitalLabel = (value?: string | null) => {
  const normalized = (value || "").trim().toUpperCase();
  const labels: Record<string, string> = {
    TEMPERATURE: "Température",
    BLOOD_PRESSURE: "Tension artérielle",
    OXYGEN_SATURATION: "Saturation en oxygène",
    HEART_RATE: "Pouls",
    RESPIRATORY_RATE: "Fréquence respiratoire",
    WEIGHT: "Poids",
    HEIGHT: "Taille",
    CHEST_CIRCUMFERENCE: "Périmètre thoracique",
    ARM_CIRCUMFERENCE: "Périmètre brachial",
  };

  if (labels[normalized]) return labels[normalized];

  return (value || "")
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
};

export default function HospitalisationsMedecin() {
  const { currentUser } = useAuth();
  const [patients, setPatients] = useState<DoctorPatient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [selectedConsultationId, setSelectedConsultationId] = useState("");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({ admissionReason: "", bedNumber: "", nurseInChargeId: "" });
  const [roomOptions, setRoomOptions] = useState<BedSelectionRoom[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [selectedBedId, setSelectedBedId] = useState("");

  const load = async () => {
    const data = await fetchDoctorVisiblePatients();
    setPatients(data);
    setSelectedPatientId((current) => current || data.find((patient) => patient.hospitalizations?.length)?.id || data.find(hasConsultations)?.id || "");
  };

  const loadRooms = async () => {
    try {
      const data = await apiFetch<BedSelectionRoom[]>("/hospitalizations/rooms");
      const roomsWithBeds = (data || []).filter((room) => (room.beds || []).length > 0);
      setRoomOptions(roomsWithBeds);
      if (!selectedRoomId && roomsWithBeds.length) {
        const fallback = roomsWithBeds.find((room) => (room.beds || []).some((bed) => bed.status === "FREE")) || roomsWithBeds[0];
        setSelectedRoomId(fallback.id);
      }
    } catch {
      setRoomOptions([]);
    }
  };

  useEffect(() => {
    load();
    void loadRooms();
    const handler = () => load();
    window.addEventListener("d7:hospitalization.updated", handler);
    window.addEventListener("d7:clinicalDataUpdated", handler);
    return () => {
      window.removeEventListener("d7:hospitalization.updated", handler);
      window.removeEventListener("d7:clinicalDataUpdated", handler);
    };
  }, []);

  const filteredPatients = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return patients.filter((patient) => {
      const relevant = patient.hospitalizations?.length || hasConsultations(patient);
      return relevant && (!normalized || patientSearchText(patient).includes(normalized));
    });
  }, [patients, query]);

  const selectedPatient = patients.find((patient) => patient.id === selectedPatientId) || filteredPatients[0] || null;
  const selectedConsultation = selectedPatient?.consultations?.find((consultation) => consultation.id === selectedConsultationId) || selectedPatient?.consultations?.[0] || null;
  const hospitalizedPatients = patients.filter((patient) => patient.hospitalizations?.some((item) => item.status !== "DISCHARGED"));
  const canWrite = Boolean(selectedPatient?.access?.canWrite);
  const bedSelection = useMemo(() => getBedSelectionState(roomOptions, selectedRoomId), [roomOptions, selectedRoomId]);
  const selectedRoom = roomOptions.find((room) => room.id === bedSelection.selectedRoomId) || null;
  const selectedBed = (selectedRoom?.beds || []).find((bed) => bed.id === selectedBedId) || null;

  useEffect(() => {
    if (!bedSelection.availableBeds.length) {
      setSelectedBedId("");
      return;
    }
    if (!selectedBedId || !bedSelection.availableBeds.some((bed) => bed.id === selectedBedId)) {
      setSelectedBedId(bedSelection.availableBeds[0].id);
    }
  }, [bedSelection.availableBeds, selectedBedId]);

  const declareHospitalization = async () => {
    if (!selectedPatient || !selectedConsultation || !form.admissionReason.trim()) {
      setMessage("Choisissez un patient avec consultation et renseignez le motif d'hospitalisation.");
      return;
    }
    if (!canWrite) {
      setMessage("Dossier en lecture seule: seul le medecin autorise peut declarer l'hospitalisation.");
      return;
    }
    if (!selectedBedId) {
      setMessage("Aucun lit libre n'est disponible pour l'instant. Choisissez une chambre avec au moins un lit libre.");
      return;
    }

    const bedLabel = selectedRoom && selectedBed ? `${selectedRoom.number} - Lit ${selectedBed.code}` : undefined;

    await apiFetch("/hospitalizations", {
      method: "POST",
      body: JSON.stringify({
        patientId: selectedPatient.id,
        physicianId: currentUser?.id,
        admissionReason: form.admissionReason,
        bedId: selectedBedId,
        bedNumber: bedLabel || form.bedNumber || undefined,
        nurseInChargeId: form.nurseInChargeId || undefined,
      }),
    });
    setForm({ admissionReason: "", bedNumber: "", nurseInChargeId: "" });
    setSelectedBedId("");
    setSelectedRoomId("");
    setMessage("Hospitalisation declaree et dossier patient mis a jour.");
    await load();
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 dark:bg-slate-950 sm:p-6">
      <PageMeta title="Hospitalisations medecin | D7 Clinique" description="Suivi des patients hospitalises." />
      <PageBreadcrumb pageTitle="Hospitalisations" />
      <Header title="Hospitalisations" subtitle="Declarer une hospitalisation depuis une consultation et suivre les patients hospitalises." />

      <div className="mt-6 grid gap-6 xl:grid-cols-[380px_1fr]">
        <PatientList patients={filteredPatients} selectedId={selectedPatient?.id || ""} query={query} onQuery={setQuery} onSelect={(patient) => { setSelectedPatientId(patient.id); setSelectedConsultationId(patient.consultations?.[0]?.id || ""); }} />

        <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          {message && <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">{message}</div>}
          {selectedPatient ? (
            <>
              <PatientHeader patient={selectedPatient} />
              <div className="mt-5 grid gap-4 xl:grid-cols-2">
                <Panel title="Declarer l'hospitalisation">
                  <Select label="Consultation source" value={selectedConsultation?.id || ""} onChange={setSelectedConsultationId} options={(selectedPatient.consultations || []).map((consultation) => [consultation.id, consultationLabel(consultation)] as [string, string])} />
                  <Textarea label="Motif d'hospitalisation" value={form.admissionReason} onChange={(value) => setForm((current) => ({ ...current, admissionReason: value }))} />
                  <div className="space-y-3">
                    <Select label="Chambre" value={bedSelection.selectedRoomId || ""} onChange={(value) => { setSelectedRoomId(value); const room = roomOptions.find((item) => item.id === value); const freeBeds = (room?.beds || []).filter((bed) => bed.status === "FREE"); setSelectedBedId(freeBeds[0]?.id || ""); }} options={roomOptions.map((room) => [room.id, room.number] as [string, string])} />
                    <Select label="Lit" value={selectedBedId} onChange={setSelectedBedId} options={(selectedRoom?.beds || []).filter((bed) => bed.status === "FREE").map((bed) => [bed.id, bed.code] as [string, string])} />
                    {bedSelection.message && <p className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-sm text-amber-700">{bedSelection.message}</p>}
                  </div>
                  <Input label="Infirmier responsable (ID optionnel)" value={form.nurseInChargeId} onChange={(value) => setForm((current) => ({ ...current, nurseInChargeId: value }))} />
                  <button disabled={!canWrite || !selectedConsultation || !selectedBedId} onClick={declareHospitalization} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:bg-slate-300 disabled:text-slate-600">Hospitaliser</button>
                </Panel>

                <Panel title="Hospitalisations du patient">
                  {(selectedPatient.hospitalizations || []).length === 0 ? <SmallEmpty /> : selectedPatient.hospitalizations?.map((hospitalization) => (
                    <div key={hospitalization.id} className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-950">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-semibold text-slate-900 dark:text-white">{hospitalization.status}</p>
                        <Badge>{hospitalization.bedNumber || "Lit non assigne"}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{formatDateTime(hospitalization.admittedAt)}</p>
                      <p className="mt-2 text-slate-600 dark:text-slate-300">{hospitalization.admissionReason || "Motif non renseigne."}</p>
                      <p className="mt-2 text-xs text-slate-500">Medecin: {hospitalization.physician?.displayName || "Non renseigne"} | Infirmier: {hospitalization.nurseInCharge?.displayName || "Non renseigne"}</p>
                    </div>
                  ))}
                </Panel>
              </div>

              <div className="mt-5 grid gap-4">
                <Panel title="Signes et soins traces">
                  {(selectedPatient.vitalSigns || []).length === 0 ? <SmallEmpty /> : selectedPatient.vitalSigns?.slice(0, 8).map((sign) => (
                    <div key={`${sign.type}-${sign.recordedAt}`} className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-950">
                      <p className="font-semibold text-slate-900 dark:text-white">{formatVitalLabel(sign.type)} : {sign.value} {sign.unit || ""}</p>
                      <p className="text-xs text-slate-500">{formatDateTime(sign.recordedAt)} - {sign.recordedBy?.displayName || "Infirmier"}</p>
                      {sign.note && <p className="mt-2 text-slate-600 dark:text-slate-300">{sign.note}</p>}
                    </div>
                  ))}
                </Panel>
                <Panel title="Patients hospitalises">
                  {hospitalizedPatients.length === 0 ? <SmallEmpty /> : hospitalizedPatients.map((patient) => (
                    <button key={patient.id} onClick={() => setSelectedPatientId(patient.id)} className="block w-full rounded-lg bg-slate-50 p-3 text-left text-sm hover:bg-blue-50 dark:bg-slate-950">
                      <p className="font-semibold text-slate-900 dark:text-white">{formatDoctorPatientName(patient)}</p>
                      <p className="mt-1 text-xs text-slate-500">{patient.hospitalizations?.[0]?.bedNumber || "Lit non assigne"} - {patient.workflowStatus}</p>
                    </button>
                  ))}
                </Panel>
              </div>
            </>
          ) : <SmallEmpty />}
        </section>
      </div>
    </div>
  );
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
  return <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800"><h3 className="font-semibold text-slate-900 dark:text-white">{title}</h3><div className="mt-3 space-y-3">{children}</div></div>;
}

function Badge({ children }: { children: ReactNode }) {
  return <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">{children}</span>;
}

function Input({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <label className="block text-sm"><span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">{label}</span><input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>;
}

function Textarea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block text-sm"><span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">{label}</span><textarea value={value} onChange={(event) => onChange(event.target.value)} rows={4} className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>;
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<[string, string]> }) {
  return <label className="block text-sm"><span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700 dark:bg-slate-950 dark:text-white">{options.length ? options.map(([key, label]) => <option key={key} value={key}>{label}</option>) : <option value="">Aucune consultation</option>}</select></label>;
}

function SmallEmpty() {
  return <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500 dark:bg-slate-950">Aucune donnee disponible.</p>;
}
