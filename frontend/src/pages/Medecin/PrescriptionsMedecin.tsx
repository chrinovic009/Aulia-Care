import { useEffect, useMemo, useState, type ReactNode } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { AvailableMedication, DoctorPatient, createPrescription, fetchAvailableMedications, fetchDoctorVisiblePatients, formatDoctorPatientName } from "../../api/doctor";
import { consultationLabel, formatDateTime, hasConsultations, patientSearchText, serviceLabel } from "./medecinShared";

export default function PrescriptionsMedecin() {
  const [patients, setPatients] = useState<DoctorPatient[]>([]);
  const [medications, setMedications] = useState<AvailableMedication[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [selectedConsultationId, setSelectedConsultationId] = useState("");
  const [query, setQuery] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({
    medicationId: "",
    quantity: "1",
    dosage: "",
    route: "ORAL",
    frequency: "DAILY",
    durationDays: "",
    notes: "",
    instruction: "",
  });

  const load = async () => {
    const [patientData, medicationData] = await Promise.all([fetchDoctorVisiblePatients(), fetchAvailableMedications().catch(() => [])]);
    const withConsultations = patientData.filter(hasConsultations);
    setPatients(withConsultations);
    setMedications(medicationData);
    setSelectedPatientId((current) => current || withConsultations[0]?.id || "");
    setSelectedConsultationId((current) => current || withConsultations[0]?.consultations?.[0]?.id || "");
  };

  useEffect(() => {
    load();
    const handler = () => load();
    window.addEventListener("d7:clinicalDataUpdated", handler);
    window.addEventListener("d7:billingDataUpdated", handler);
    return () => {
      window.removeEventListener("d7:clinicalDataUpdated", handler);
      window.removeEventListener("d7:billingDataUpdated", handler);
    };
  }, []);

  const filteredPatients = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return patients.filter((patient) => !normalized || patientSearchText(patient).includes(normalized));
  }, [patients, query]);

  const selectedPatient = patients.find((patient) => patient.id === selectedPatientId) || filteredPatients[0] || null;
  const sections = useMemo(
    () => Array.from(new Map(medications.filter((item) => item.category?.section).map((item) => [item.category!.section!.id, item.category!.section!])).values()),
    [medications],
  );
  const categories = useMemo(() => {
    if (!sectionId) {
      return [];
    }
    return Array.from(
      new Map(
        medications
          .filter((item) => item.category?.section?.id === sectionId)
          .filter((item) => item.category)
          .map((item) => [item.category!.id, item.category!]),
      ).values(),
    );
  }, [medications, sectionId]);

  const selectableMedications = useMemo(() => {
    const normalized = searchTerm.trim().toLowerCase();
    return medications.filter((item) => {
      const matchesSection = !sectionId || item.category?.section?.id === sectionId;
      const matchesCategory = !categoryId || item.category?.id === categoryId;
      const matchesSearch = !normalized || `${item.name} ${item.strength || ""} ${item.code}`.toLowerCase().includes(normalized);
      return matchesSection && matchesCategory && matchesSearch;
    });
  }, [categoryId, medications, searchTerm, sectionId]);

  const selectedConsultation = selectedPatient?.consultations?.find((consultation) => consultation.id === selectedConsultationId) || selectedPatient?.consultations?.[0] || null;
  const canWrite = Boolean(selectedPatient?.access?.canWrite);
  const pendingExam = Boolean(
    selectedPatient?.labRequests?.some((request) => {
      const status = (request.status || "").toUpperCase();
      const treatedStatuses = new Set([
        "PENDING",
        "CORRECTION_REQUESTED",
        "IN_ANALYSIS",
        "RECEIVED",
        "COLLECTED",
        "TECHNICAL_VALIDATION",
        "BIOLOGICAL_VALIDATION",
        "TECHNICAL_VALIDATED",
        "BIOLOGICALLY_VALIDATED",
        "AVAILABLE",
        "SENT",
        "VERIFIED",
        "COMPLETED",
      ]);
      const isTreated = treatedStatuses.has(status);
      const hasVerifiedResult = request.results?.some((result) => result.verified);
      return !isTreated && !hasVerifiedResult;
    }),
  );

  const submit = async () => {
    if (!selectedConsultation || !form.medicationId) {
      setMessage("Choisissez une consultation et un medicament.");
      return;
    }
    if (!canWrite) {
      setMessage("Dossier en lecture seule.");
      return;
    }
    if (pendingExam) {
      setMessage("Prescription verrouillee: un resultat d'examen demande n'est pas encore verifie.");
      return;
    }

    const medication = medications.find((item) => item.id === form.medicationId);
    await createPrescription(selectedConsultation.id, {
      instruction: form.instruction,
      lines: [
        {
          medicationId: form.medicationId,
          quantity: Number(form.quantity || 1),
          dosage: form.dosage,
          route: form.route,
          frequency: form.frequency,
          durationDays: form.durationDays ? Number(form.durationDays) : undefined,
          notes: form.notes,
          unitPrice: medication?.unitPrice ? Number(medication.unitPrice) : undefined,
        },
      ],
    });
    setForm({ medicationId: "", quantity: "1", dosage: "", route: "ORAL", frequency: "DAILY", durationDays: "", notes: "", instruction: "" });
    setMessage("Prescription creee et envoyee a la caisse.");
    await load();
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 dark:bg-slate-950 sm:p-6">
      <PageMeta title="Prescriptions medecin | D7 Clinique" description="Prescriptions depuis le stock pharmaceutique." />
      <PageBreadcrumb pageTitle="Prescriptions" />
      <Header title="Prescriptions" subtitle="Prescrire depuis les medicaments disponibles au stock, apres resultats d'examens si necessaire." />
      {patients.length === 0 ? <EmptyState /> : (
        <div className="mt-6 grid gap-6 xl:grid-cols-[380px_1fr]">
          <PatientList
            patients={filteredPatients}
            selectedId={selectedPatient?.id || ""}
            query={query}
            onQuery={setQuery}
            onSelect={(patient) => {
              setSelectedPatientId(patient.id);
              setSelectedConsultationId(patient.consultations?.[0]?.id || "");
            }}
          />
          <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            {message && <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">{message}</div>}
            {selectedPatient && selectedConsultation ? (
              <>
                <PatientHeader patient={selectedPatient} pendingExam={pendingExam} />
                <div className="mt-5 grid gap-4 xl:grid-cols-2">
                  <Panel title="Nouvelle prescription">
                    <Select label="Consultation" value={selectedConsultation.id} onChange={setSelectedConsultationId} options={(selectedPatient.consultations || []).map((consultation) => [consultation.id, consultationLabel(consultation)] as [string, string])} />
                    <Select label="Section" value={sectionId} onChange={(value) => { setSectionId(value); setCategoryId(""); setForm((current) => ({ ...current, medicationId: "" })); }} options={[['', 'Toutes les sections'], ...sections.map((section) => [section.id, section.name] as [string, string])]} />
                    <Select label="Catégorie" value={categoryId} onChange={(value) => { setCategoryId(value); setForm((current) => ({ ...current, medicationId: "" })); }} options={sectionId ? [['', 'Choisir une catégorie'], ...categories.map((category) => [category.id, category.name] as [string, string])] : [['', 'Choisir une section d\'abord']]} />
                    <Input label="Rechercher un médicament" value={searchTerm} onChange={setSearchTerm} />
                    <Select label="Médicament disponible" value={form.medicationId} onChange={(value) => setForm((current) => ({ ...current, medicationId: value }))} options={sectionId && categoryId ? [['', 'Choisir'], ...selectableMedications.map((medication) => [medication.id, `${medication.name}${medication.strength ? ` ${medication.strength}` : ""} - stock ${medication.availableQuantity}`] as [string, string])] : [['', 'Choisir une section puis une catégorie']]} />
                    <div className="grid gap-3 md:grid-cols-2">
                      <Input label="Quantite" value={form.quantity} onChange={(value) => setForm((current) => ({ ...current, quantity: value }))} type="number" />
                      <Input label="Posologie" value={form.dosage} onChange={(value) => setForm((current) => ({ ...current, dosage: value }))} />
                      <Select label="Voie" value={form.route} onChange={(value) => setForm((current) => ({ ...current, route: value }))} options={[['ORAL', 'Orale'], ['INTRAVENOUS', 'IV'], ['INTRAMUSCULAR', 'IM'], ['SUBCUTANEOUS', 'SC'], ['TOPICAL', 'Topique'], ['INHALATION', 'Inhalation'], ['OTHER', 'Autre']]} />
                      <Select label="Frequence" value={form.frequency} onChange={(value) => setForm((current) => ({ ...current, frequency: value }))} options={[['ONCE', 'Une fois'], ['DAILY', 'Quotidien'], ['BID', '2x/jour'], ['TID', '3x/jour'], ['QID', '4x/jour'], ['PRN', 'Si besoin'], ['CONTINUOUS', 'Continu']]} />
                      <Input label="Duree jours" value={form.durationDays} onChange={(value) => setForm((current) => ({ ...current, durationDays: value }))} type="number" />
                      <Input label="Note" value={form.notes} onChange={(value) => setForm((current) => ({ ...current, notes: value }))} />
                    </div>
                    <Textarea label="Conseils / recommandations" value={form.instruction} onChange={(value) => setForm((current) => ({ ...current, instruction: value }))} />
                    <button disabled={!canWrite || pendingExam || !sectionId || !categoryId || !form.medicationId} onClick={submit} className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:bg-slate-300 disabled:text-slate-600">Prescrire</button>
                  </Panel>
                  <Panel title="Prescriptions du patient">
                    {(selectedPatient.prescriptions || []).length === 0 ? <SmallEmpty /> : selectedPatient.prescriptions?.map((prescription) => (
                      <div key={prescription.id} className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-950">
                        <p className="font-semibold text-slate-900 dark:text-white">{prescription.status} - {prescription.prescriber?.displayName || "Medecin"}</p>
                        <p className="mt-1 text-xs text-slate-500">{formatDateTime(prescription.prescribingDate)}</p>
                        <p className="mt-2 text-slate-600 dark:text-slate-300">{prescription.lineItems?.map((line) => `${line.medication?.name || "Medicament"} - ${line.dosage || ""} - ${line.frequency || ""}`).join(", ") || prescription.instruction || "-"}</p>
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
  return <aside className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Rechercher patient..." className="mb-4 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white" /><div className="space-y-3">{patients.map((patient) => <button key={patient.id} onClick={() => onSelect(patient)} className={`w-full rounded-lg border p-3 text-left ${selectedId === patient.id ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"}`}><p className="font-semibold text-slate-900 dark:text-white">{formatDoctorPatientName(patient)}</p><p className="mt-1 text-xs text-slate-500">{serviceLabel(patient)}</p></button>)}</div></aside>;
}
function PatientHeader({ patient, pendingExam }: { patient: DoctorPatient; pendingExam: boolean }) {
  return <div className="flex flex-col gap-2 border-b border-slate-200 pb-4 dark:border-slate-800"><h2 className="text-xl font-semibold text-slate-900 dark:text-white">{formatDoctorPatientName(patient)}</h2><p className="text-sm text-slate-500">{serviceLabel(patient)} - {patient.workflowStatus}</p>{pendingExam && <span className="w-fit rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">Examen en attente: prescription bloquee</span>}</div>;
}
function Panel({ title, children }: { title: string; children: ReactNode }) { return <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800"><h3 className="font-semibold text-slate-900 dark:text-white">{title}</h3><div className="mt-3 space-y-3">{children}</div></div>; }
function Input({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) { return <label className="block text-sm"><span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>; }
function Textarea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="block text-sm"><span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">{label}</span><textarea value={value} onChange={(event) => onChange(event.target.value)} rows={3} className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>; }
function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<[string, string]> }) { return <label className="block text-sm"><span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700 dark:bg-slate-950 dark:text-white">{options.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>; }
function EmptyState() { return <div className="mt-6 rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Aucune consultation disponible.</div>; }
function SmallEmpty() { return <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500 dark:bg-slate-950">Aucune donnee disponible.</p>; }
