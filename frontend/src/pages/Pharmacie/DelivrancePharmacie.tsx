import { useEffect, useMemo, useState } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { apiFetch } from "../../config/api";
import { createIndependentSale, dispensePrescription, fetchPrescriptions, PharmacyPrescriptionLine } from "../../api/pharmacy";

type PatientSummary = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  admissionType?: string | null;
  displayId?: string | null;
  workflowStatus?: string | null;
  service?: string | { id?: string; name?: string } | null;
};

type PrescriptionDetail = {
  id: string;
  status: string;
  prescribingDate: string;
  instruction?: string | null;
  patient?: PatientSummary | null;
  prescriber?: { displayName?: string | null } | null;
  lineItems?: PharmacyPrescriptionLine[];
};

type MedicationOption = {
  id: string;
  name: string;
  unit?: string | null;
  strength?: string | null;
  availableQuantity?: number | string | null;
  unitPrice?: number | string | null;
};

export default function DelivrancePharmacie() {
  const [prescriptions, setPrescriptions] = useState<PrescriptionDetail[]>([]);
  const [selectedPrescriptionId, setSelectedPrescriptionId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [medications, setMedications] = useState<MedicationOption[]>([]);
  const [saleForm, setSaleForm] = useState({ medicationId: "", quantity: "1" });

  const load = async () => {
    setIsLoading(true);
    try {
      const [allPrescriptions, catalog] = await Promise.all([
        fetchPrescriptions().catch(() => []),
        apiFetch<MedicationOption[]>("/pharmacy/available").catch(() => []),
      ]);
      setPrescriptions(allPrescriptions as PrescriptionDetail[]);
      setMedications(catalog || []);
      if (allPrescriptions?.length) {
        setSelectedPrescriptionId((current) => current || allPrescriptions[0].id);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filteredPrescriptions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return prescriptions;
    return prescriptions.filter((item) => {
      const patientName = [item.patient?.firstName, item.patient?.lastName].filter(Boolean).join(" ").toLowerCase();
      const prescriptionText = [item.instruction, item.lineItems?.map((line) => line.medication?.name).join(" ")].filter(Boolean).join(" ").toLowerCase();
      return patientName.includes(query) || prescriptionText.includes(query);
    });
  }, [prescriptions, search]);

  const selectedPrescription = filteredPrescriptions.find((item) => item.id === selectedPrescriptionId) || filteredPrescriptions[0] || null;

  const submitSale = async () => {
    if (!saleForm.medicationId || !saleForm.quantity) {
      setMessage("Choisissez un médicament et une quantité.");
      return;
    }

    try {
      await createIndependentSale({
        medicationId: saleForm.medicationId,
        quantity: Number(saleForm.quantity || 1),
        source: "PHARMACY_INDEPENDENT",
      });
      setMessage("Vente enregistrée avec succès.");
      setSaleForm({ medicationId: "", quantity: "1" });
      await load();
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : "Impossible d’enregistrer la vente.");
    }
  };

  const deliver = async (prescriptionId: string) => {
    try {
      await dispensePrescription(prescriptionId);
      setMessage("Prescription délivrée avec succès.");
      await load();
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : "Impossible de délivrer la prescription.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 dark:bg-slate-950 sm:p-6">
      <PageMeta title="Pharmacie | Délivrance" description="Vue patient, prescription et vente indépendante" />
      <PageBreadcrumb pageTitle="Délivrance" />

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pharmacie</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">Délivrance et vente indépendante</h1>
            <p className="mt-1 text-sm text-slate-500">Sélectionnez un patient, consultez sa prescription puis procédez à la délivrance ou à une vente directe.</p>
          </div>
          <button onClick={() => load()} className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white">
            {isLoading ? "Chargement..." : "Actualiser"}
          </button>
        </div>

        {message && <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">{message}</div>}
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[360px_1fr]">
        <aside className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rechercher un patient ou un médicament"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          />
          <div className="mt-4 space-y-3">
            {isLoading ? (
              <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500 dark:bg-slate-950">Chargement...</div>
            ) : filteredPrescriptions.length === 0 ? (
              <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500 dark:bg-slate-950">Aucune prescription prête.</div>
            ) : (
              filteredPrescriptions.map((item) => {
                const patientName = [item.patient?.firstName, item.patient?.lastName].filter(Boolean).join(" ") || "Patient";
                return (
                  <button
                    key={item.id}
                    onClick={() => setSelectedPrescriptionId(item.id)}
                    className={`w-full rounded-lg border p-3 text-left transition ${selectedPrescriptionId === item.id ? "border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/40" : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-slate-900 dark:text-white">{patientName}</p>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${item.status === "DISPENSED" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                        {item.status === "DISPENSED" ? "Déjà livré" : "À livrer"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{item.lineItems?.map((line) => `${line.medication?.name || "Médicament"} x${line.quantity}`).join(", ") || item.instruction || "Aucun détail"}</p>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <section className="space-y-6">
          {selectedPrescription ? (
            <>
              <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase text-slate-500">Patient sélectionné</p>
                    <h2 className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">
                      {[selectedPrescription.patient?.firstName, selectedPrescription.patient?.lastName].filter(Boolean).join(" ") || "Patient"}
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">{selectedPrescription.patient?.phone || "—"} • {selectedPrescription.patient?.email || "—"}</p>
                    <div className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${selectedPrescription.status === "DISPENSED" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                      {selectedPrescription.status === "DISPENSED" ? "Déjà livré" : "À livrer"}
                    </div>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-950">
                    <p className="font-semibold text-slate-900 dark:text-white">Prescription</p>
                    <p className="mt-1 text-slate-500">{selectedPrescription.status}</p>
                    <p className="mt-1 text-xs text-slate-400">{selectedPrescription.prescribingDate ? new Date(selectedPrescription.prescribingDate).toLocaleString("fr-FR") : "—"}</p>
                  </div>
                </div>

                <div className="mt-6 grid gap-4 lg:grid-cols-2">
                  <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                    <h3 className="font-semibold text-slate-900 dark:text-white">Détails du patient</h3>
                    <dl className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                      <div className="flex justify-between gap-3"><dt className="font-medium">Adresse</dt><dd>{selectedPrescription.patient?.address || "—"}</dd></div>
                      <div className="flex justify-between gap-3"><dt className="font-medium">Identifiant administratif</dt><dd>{selectedPrescription.patient?.displayId || selectedPrescription.patient?.admissionType || "—"}</dd></div>
                      <div className="flex justify-between gap-3"><dt className="font-medium">Statut</dt><dd>{selectedPrescription.patient?.workflowStatus || "—"}</dd></div>
                      <div className="flex justify-between gap-3"><dt className="font-medium">Service</dt><dd>{typeof selectedPrescription.patient?.service === "string" ? selectedPrescription.patient.service : selectedPrescription.patient?.service?.name || "—"}</dd></div>
                    </dl>
                  </div>

                  <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                    <h3 className="font-semibold text-slate-900 dark:text-white">Détails de la prescription</h3>
                    <div className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                      {selectedPrescription.lineItems?.length ? selectedPrescription.lineItems.map((line) => (
                        <div key={line.id} className="rounded-lg bg-slate-50 p-2.5 dark:bg-slate-950">
                          <div className="font-semibold text-slate-900 dark:text-white">{line.medication?.name || "Médicament"}</div>
                          <div className="mt-1 text-xs">Qté: {line.quantity} • Posologie: {line.dosage || "—"} • Fréquence: {line.frequency || "—"}</div>
                        </div>
                      )) : <p>Aucune ligne.</p>}
                      {selectedPrescription.instruction && <p className="mt-2 text-xs italic text-slate-500">{selectedPrescription.instruction}</p>}
                    </div>
                  </div>
                </div>

                {selectedPrescription.status !== "DISPENSED" && (
                  <div className="mt-6 flex flex-wrap gap-3">
                    <button onClick={() => deliver(selectedPrescription.id)} className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white">Délivrer la prescription</button>
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Vente indépendante de la pharmacie</h3>
                <p className="mt-1 text-sm text-slate-500">Enregistrez une vente directe sans prescription, en utilisant le prix du médicament du catalogue.</p>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="text-sm">
                    <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">Médicament</span>
                    <select value={saleForm.medicationId} onChange={(event) => setSaleForm((current) => ({ ...current, medicationId: event.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700 dark:bg-slate-950 dark:text-white">
                      <option value="">Choisir</option>
                      {medications.map((medication) => <option key={medication.id} value={medication.id}>{medication.name}</option>)}
                    </select>
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">Quantité</span>
                    <input value={saleForm.quantity} onChange={(event) => setSaleForm((current) => ({ ...current, quantity: event.target.value }))} type="number" min="1" className="w-full rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
                  </label>
                </div>
                {saleForm.medicationId && (
                  <p className="mt-3 text-sm text-slate-500">
                    Prix utilisé : {medications.find((item) => item.id === saleForm.medicationId)?.unitPrice ?? 0} FC
                  </p>
                )}
                <div className="mt-4">
                  <button onClick={submitSale} className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white">Enregistrer la vente</button>
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">Sélectionnez une prescription pour voir le détail patient et la prescription.</div>
          )}
        </section>
      </div>
    </div>
  );
}
