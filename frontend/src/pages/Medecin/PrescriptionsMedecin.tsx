import { useEffect, useMemo, useState, type ReactNode } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { AvailableMedication, DoctorPatient, createPrescription, fetchAvailableMedications, fetchDoctorVisiblePatients, formatDoctorPatientName, updatePrescription } from "../../api/doctor";
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
  const [editingPrescriptionId, setEditingPrescriptionId] = useState<string | null>(null);
  const [selectedMedicationIds, setSelectedMedicationIds] = useState<string[]>([]);
  const [selectedMedicationDetails, setSelectedMedicationDetails] = useState<Record<string, {
    quantity: string;
    dosage: string;
    route: string;
    frequency: string;
    durationDays: string;
    notes: string;
  }>>({});
  const [editForm, setEditForm] = useState({
    medicationId: "",
    quantity: "1",
    dosage: "",
    route: "ORAL",
    frequency: "DAILY",
    durationDays: "",
    notes: "",
    instruction: "",
  });
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

  const addMedicationSelection = (medicationId: string) => {
    setSelectedMedicationIds((current) => (current.includes(medicationId) ? current : [...current, medicationId]));
    setSelectedMedicationDetails((current) => {
      if (current[medicationId]) {
        return current;
      }
      return {
        ...current,
        [medicationId]: {
          quantity: form.quantity,
          dosage: form.dosage,
          route: form.route,
          frequency: form.frequency,
          durationDays: form.durationDays,
          notes: form.notes,
        },
      };
    });
  };

  const updateMedicationDetail = (medicationId: string, patch: Partial<(typeof selectedMedicationDetails)[string]>) => {
    setSelectedMedicationDetails((current) => ({
      ...current,
      [medicationId]: {
        quantity: current[medicationId]?.quantity ?? form.quantity,
        dosage: current[medicationId]?.dosage ?? form.dosage,
        route: current[medicationId]?.route ?? form.route,
        frequency: current[medicationId]?.frequency ?? form.frequency,
        durationDays: current[medicationId]?.durationDays ?? form.durationDays,
        notes: current[medicationId]?.notes ?? form.notes,
        ...patch,
      },
    }));
  };

  const submit = async () => {
    if (!selectedConsultation || selectedMedicationIds.length === 0) {
      setMessage("Choisissez une consultation et au moins un médicament.");
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

    const lines = selectedMedicationIds.map((medicationId) => {
      const medication = medications.find((item) => item.id === medicationId);
      const detail = selectedMedicationDetails[medicationId] || {
        quantity: form.quantity,
        dosage: form.dosage,
        route: form.route,
        frequency: form.frequency,
        durationDays: form.durationDays,
        notes: form.notes,
      };
      return {
        medicationId,
        quantity: Number(detail.quantity || 1),
        dosage: detail.dosage,
        route: detail.route,
        frequency: detail.frequency,
        durationDays: detail.durationDays ? Number(detail.durationDays) : undefined,
        notes: detail.notes,
        unitPrice: medication?.unitPrice ? Number(medication.unitPrice) : undefined,
      };
    });

    await createPrescription(selectedConsultation.id, {
      instruction: form.instruction,
      lines,
    });
    setSelectedMedicationIds([]);
    setSelectedMedicationDetails({});
    setForm({ medicationId: "", quantity: "1", dosage: "", route: "ORAL", frequency: "DAILY", durationDays: "", notes: "", instruction: "" });
    setMessage("Prescription creee et envoyee a la caisse.");
    await load();
  };

  const prescriptionStatusLabel = (status?: string | null) => {
    const s = String(status || "").trim().toUpperCase();
    switch (s) {
      case "PRESCRIBED":
        return "En attente de délivrance";
      case "DISPENSED":
        return "Délivrée";
      case "PARTIALLY_DISPENSED":
        return "Partiellement délivrée";
      case "CANCELLED":
        return "Annulée";
      case "COMPLETED":
        return "Complétée";
      default:
        return status || "Statut inconnu";
    }
  };

  const canModifyPrescription = (prescription: NonNullable<DoctorPatient['prescriptions']>[number]) => {
    const status = String(prescription.status || "").toUpperCase();
    if (["DISPENSED", "PARTIALLY_DISPENSED", "CANCELLED", "COMPLETED"].includes(status)) {
      return false;
    }

    const prescriptionAge = Date.now() - new Date(prescription.prescribingDate).getTime();
    return prescriptionAge <= 24 * 60 * 60 * 1000;
  };

  const openPrescriptionEdit = (prescription: NonNullable<DoctorPatient['prescriptions']>[number]) => {
    const firstLine = prescription.lineItems?.[0];
    const medicationId = medications.find((item) => item.name === firstLine?.medication?.name)?.id || "";
    setEditingPrescriptionId(prescription.id);
    setEditForm({
      medicationId,
      quantity: String(firstLine?.quantity || 1),
      dosage: firstLine?.dosage || "",
      route: "ORAL",
      frequency: firstLine?.frequency || "DAILY",
      durationDays: "",
      notes: firstLine?.notes || "",
      instruction: prescription.instruction || "",
    });
  };

  const savePrescriptionEdit = async () => {
    if (!selectedConsultation || !editingPrescriptionId) {
      return;
    }

    const medication = medications.find((item) => item.id === editForm.medicationId);
    await updatePrescription(selectedConsultation.id, editingPrescriptionId, {
      instruction: editForm.instruction,
      lines: [
        {
          medicationId: editForm.medicationId,
          quantity: Number(editForm.quantity || 1),
          dosage: editForm.dosage,
          route: editForm.route,
          frequency: editForm.frequency,
          durationDays: editForm.durationDays ? Number(editForm.durationDays) : undefined,
          notes: editForm.notes,
          unitPrice: medication?.unitPrice ? Number(medication.unitPrice) : undefined,
        },
      ],
    });

    setMessage("Prescription modifiee avec succes.");
    setEditingPrescriptionId(null);
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
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-slate-600 dark:text-slate-300">Médicaments disponibles</label>
                      <select
                        value=""
                        onChange={(event) => {
                          const value = event.target.value;
                          if (!value) return;
                          addMedicationSelection(value);
                          event.target.value = "";
                        }}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                      >
                        <option value="">Choisir un médicament</option>
                        {selectableMedications.map((medication) => (
                          <option key={medication.id} value={medication.id}>{`${medication.name}${medication.strength ? ` ${medication.strength}` : ""} - stock ${medication.availableQuantity}`}</option>
                        ))}
                      </select>
                      {selectedMedicationIds.length > 0 ? (
                        <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-950">
                          {selectedMedicationIds.map((medicationId) => {
                            const medication = selectableMedications.find((item) => item.id === medicationId) || medications.find((item) => item.id === medicationId);
                            if (!medication) return null;
                            return (
                              <div key={medication.id} className="rounded-lg bg-white px-3 py-2 dark:bg-slate-900">
                                <div className="flex items-center justify-between gap-3">
                                  <div>
                                    <p className="font-medium text-slate-800 dark:text-slate-100">{medication.name}{medication.strength ? ` ${medication.strength}` : ""}</p>
                                    <p className="text-xs text-slate-500">Stock : {medication.availableQuantity}</p>
                                  </div>
                                  <button type="button" onClick={() => {
                                    setSelectedMedicationIds((current) => current.filter((id) => id !== medication.id));
                                    setSelectedMedicationDetails((current) => {
                                      const next = { ...current };
                                      delete next[medication.id];
                                      return next;
                                    });
                                  }} className="text-xs font-semibold text-rose-600">Retirer</button>
                                </div>
                                <div className="mt-2 grid gap-2 md:grid-cols-2">
                                  <label className="block text-xs">
                                    <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">Quantité</span>
                                    <input type="number" min="1" value={selectedMedicationDetails[medication.id]?.quantity ?? "1"} onChange={(event) => updateMedicationDetail(medication.id, { quantity: event.target.value })} className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
                                  </label>
                                  <label className="block text-xs">
                                    <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">Posologie</span>
                                    <input type="text" value={selectedMedicationDetails[medication.id]?.dosage ?? ""} onChange={(event) => updateMedicationDetail(medication.id, { dosage: event.target.value })} className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
                                  </label>
                                  <label className="block text-xs">
                                    <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">Voie</span>
                                    <select value={selectedMedicationDetails[medication.id]?.route ?? "ORAL"} onChange={(event) => updateMedicationDetail(medication.id, { route: event.target.value })} className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white">
                                      <option value="ORAL">Orale</option>
                                      <option value="INTRAVENOUS">IV</option>
                                      <option value="INTRAMUSCULAR">IM</option>
                                      <option value="SUBCUTANEOUS">SC</option>
                                      <option value="TOPICAL">Topique</option>
                                      <option value="INHALATION">Inhalation</option>
                                      <option value="OTHER">Autre</option>
                                    </select>
                                  </label>
                                  <label className="block text-xs">
                                    <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">Fréquence</span>
                                    <select value={selectedMedicationDetails[medication.id]?.frequency ?? "DAILY"} onChange={(event) => updateMedicationDetail(medication.id, { frequency: event.target.value })} className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white">
                                      <option value="ONCE">Une fois</option>
                                      <option value="DAILY">Quotidien</option>
                                      <option value="BID">2x/jour</option>
                                      <option value="TID">3x/jour</option>
                                      <option value="QID">4x/jour</option>
                                      <option value="PRN">Si besoin</option>
                                      <option value="CONTINUOUS">Continu</option>
                                    </select>
                                  </label>
                                  <label className="block text-xs">
                                    <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">Durée (jours)</span>
                                    <input type="number" min="1" value={selectedMedicationDetails[medication.id]?.durationDays ?? ""} onChange={(event) => updateMedicationDetail(medication.id, { durationDays: event.target.value })} className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
                                  </label>
                                  <label className="block text-xs md:col-span-2">
                                    <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">Note</span>
                                    <input type="text" value={selectedMedicationDetails[medication.id]?.notes ?? ""} onChange={(event) => updateMedicationDetail(medication.id, { notes: event.target.value })} className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
                                  </label>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <Input label="Quantite" value={form.quantity} onChange={(value) => setForm((current) => ({ ...current, quantity: value }))} type="number" />
                      <Input label="Posologie" value={form.dosage} onChange={(value) => setForm((current) => ({ ...current, dosage: value }))} />
                      <Select label="Voie" value={form.route} onChange={(value) => setForm((current) => ({ ...current, route: value }))} options={[['ORAL', 'Orale'], ['INTRAVENOUS', 'IV'], ['INTRAMUSCULAR', 'IM'], ['SUBCUTANEOUS', 'SC'], ['TOPICAL', 'Topique'], ['INHALATION', 'Inhalation'], ['OTHER', 'Autre']]} />
                      <Select label="Frequence" value={form.frequency} onChange={(value) => setForm((current) => ({ ...current, frequency: value }))} options={[['ONCE', 'Une fois'], ['DAILY', 'Quotidien'], ['BID', '2x/jour'], ['TID', '3x/jour'], ['QID', '4x/jour'], ['PRN', 'Si besoin'], ['CONTINUOUS', 'Continu']]} />
                      <Input label="Duree jours" value={form.durationDays} onChange={(value) => setForm((current) => ({ ...current, durationDays: value }))} type="number" />
                      <Input label="Note" value={form.notes} onChange={(value) => setForm((current) => ({ ...current, notes: value }))} />
                    </div>
                    <Textarea label="Conseils / recommandations" value={form.instruction} onChange={(value) => setForm((current) => ({ ...current, instruction: value }))} />
                    <button disabled={!canWrite || pendingExam || !sectionId || !categoryId || selectedMedicationIds.length === 0} onClick={submit} className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:bg-slate-300 disabled:text-slate-600">Prescrire</button>
                  </Panel>
                  <Panel title="Prescriptions du patient">
                    {(selectedPatient.prescriptions || []).length === 0 ? <SmallEmpty /> : selectedPatient.prescriptions?.slice(0, 5).map((prescription) => (
                      <div key={prescription.id} className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-950">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-slate-900 dark:text-white">{prescriptionStatusLabel(prescription.status)} - {prescription.prescriber?.displayName || "Medecin"}</p>
                            <p className="mt-1 text-xs text-slate-500">{formatDateTime(prescription.prescribingDate)}</p>
                            <p className="mt-2 text-slate-600 dark:text-slate-300">{prescription.lineItems?.map((line) => `${line.medication?.name || "Medicament"} - ${line.dosage || ""} - ${line.frequency || ""}`).join(", ") || prescription.instruction || "-"}</p>
                          </div>
                          {canModifyPrescription(prescription) ? (
                            <button onClick={() => openPrescriptionEdit(prescription)} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white">Modifier</button>
                          ) : null}
                        </div>

                        {editingPrescriptionId === prescription.id ? (
                          <div className="mt-3 rounded-lg border border-blue-200 bg-white p-3 dark:border-blue-800 dark:bg-slate-900">
                            <div className="grid gap-3 md:grid-cols-2">
                              <Select label="Médicament" value={editForm.medicationId} onChange={(value) => setEditForm((current) => ({ ...current, medicationId: value }))} options={[['', 'Choisir'], ...medications.map((medication) => [medication.id, `${medication.name}${medication.strength ? ` ${medication.strength}` : ""} - stock ${medication.availableQuantity}`] as [string, string])]} />
                              <Input label="Quantité" value={editForm.quantity} onChange={(value) => setEditForm((current) => ({ ...current, quantity: value }))} type="number" />
                              <Input label="Posologie" value={editForm.dosage} onChange={(value) => setEditForm((current) => ({ ...current, dosage: value }))} />
                              <Select label="Fréquence" value={editForm.frequency} onChange={(value) => setEditForm((current) => ({ ...current, frequency: value }))} options={[['ONCE', 'Une fois'], ['DAILY', 'Quotidien'], ['BID', '2x/jour'], ['TID', '3x/jour'], ['QID', '4x/jour'], ['PRN', 'Si besoin'], ['CONTINUOUS', 'Continu']]} />
                              <Input label="Durée (jours)" value={editForm.durationDays} onChange={(value) => setEditForm((current) => ({ ...current, durationDays: value }))} type="number" />
                              <Input label="Note" value={editForm.notes} onChange={(value) => setEditForm((current) => ({ ...current, notes: value }))} />
                            </div>
                            <Textarea label="Conseils / recommandations" value={editForm.instruction} onChange={(value) => setEditForm((current) => ({ ...current, instruction: value }))} />
                            <div className="mt-3 flex gap-2">
                              <button onClick={() => void savePrescriptionEdit()} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">Enregistrer</button>
                              <button onClick={() => setEditingPrescriptionId(null)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">Annuler</button>
                            </div>
                          </div>
                        ) : null}
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
