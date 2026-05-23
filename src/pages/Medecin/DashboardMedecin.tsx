import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { CalenderIcon, BellIcon } from "../../icons";

type CriticalItem = {
  id: string;
  label: string;
  patient: string;
  status: string;
};

type Consultation = {
  id: string;
  time: string;
  patient: string;
  reason: string;
  status: string;
};

type ResultItem = {
  id: string;
  test: string;
  patient: string;
  flag: "normal" | "attention" | "critique";
};

type PrescriptionItem = {
  id: string;
  patient: string;
  therapy: string;
  status: string;
};

type AlertItem = {
  id: string;
  label: string;
  source: string;
};

type PatientDetail = {
  patient: string;
  age: string;
  service: string;
  room: string;
  nurseSummary: string;
  infirmaryResults: string;
};

type QuickPatient = {
  id: string;
  patient: string;
  category: "Hospitalisés" | "Critiques" | "Sortie prévue" | "Surveillance spéciale";
  room: string;
  note: string;
};

const criticalPatients: CriticalItem[] = [
  { id: "c1", label: "SpO2 faible et désorientation", patient: "Marie K.", status: "Urgence" },
  { id: "c2", label: "Fièvre persistante et céphalée", patient: "Joel M.", status: "Aggravation" },
  { id: "c3", label: "Hyperglycémie sévère", patient: "Claire R.", status: "Critique" },
];

const consultationsToday: Consultation[] = [
  { id: "t1", time: "08:00", patient: "Paul M.", reason: "Fièvre chronique", status: "À venir" },
  { id: "t2", time: "09:30", patient: "Juliette H.", reason: "Douleurs thoraciques", status: "À venir" },
  { id: "t3", time: "11:00", patient: "Sophie N.", reason: "Contrôle post-op", status: "En cours" },
  { id: "t4", time: "14:00", patient: "Karim B.", reason: "Suivi anticoagulant", status: "À venir" },
];

const examResults: ResultItem[] = [
  { id: "r1", test: "Gaz du sang", patient: "Marie K.", flag: "critique" },
  { id: "r2", test: "ECG", patient: "Luc D.", flag: "attention" },
  { id: "r3", test: "CRP", patient: "Claire R.", flag: "normal" },
];

const prescriptionsActive: PrescriptionItem[] = [
  { id: "p1", patient: "Luc D.", therapy: "Antibiothérapie IV", status: "Validation pharmacie" },
  { id: "p2", patient: "Nadia S.", therapy: "Ajuster insuline", status: "Expirant" },
  { id: "p3", patient: "Yohan B.", therapy: "Beta-bloquant", status: "En cours" },
];

const medicalAlerts: AlertItem[] = [
  { id: "a1", label: "Interaction médicamenteuse suspectée", source: "Pharmacie" },
  { id: "a2", label: "Allergie pénicilline confirmée", source: "Dossier infirmier" },
  { id: "a3", label: "Résultat critique reçu", source: "Labo" },
];

const quickMetrics = [
  { label: "Patients critiques", value: "3" },
  { label: "Consultations restantes", value: "4" },
  { label: "Examens en attente", value: "5" },
  { label: "Opérations prévues", value: "1" },
];

const patientDetails: Record<string, PatientDetail> = {
  "Marie K.": {
    patient: "Marie K.",
    age: "54 ans",
    service: "Neurologie",
    room: "12A",
    nurseSummary: "Perfusion en place, agitation nocturne, monitorage continu.",
    infirmaryResults: "Glycémie 2.1 g/L, TA 145/90, FC 108.",
  },
  "Joel M.": {
    patient: "Joel M.",
    age: "62 ans",
    service: "Neurochirurgie",
    room: "7B",
    nurseSummary: "Fièvre 38.8°C, céphalées, bandage sec.",
    infirmaryResults: "CRP 85 mg/L, saturation 93%, scanner planifié.",
  },
  "Claire R.": {
    patient: "Claire R.",
    age: "45 ans",
    service: "Neurologie",
    room: "9C",
    nurseSummary: "Perfusion saline, bilan glycémique q2h.",
    infirmaryResults: "Glycémie 3.6 g/L, K 3.8 mmol/L.",
  },
};

const quickPatients: QuickPatient[] = [
  { id: "q1", patient: "Marie K.", category: "Critiques", room: "12A", note: "SpO2 88%" },
  { id: "q2", patient: "Luc D.", category: "Hospitalisés", room: "7B", note: "Antibiothérapie IV" },
  { id: "q3", patient: "Claire R.", category: "Sortie prévue", room: "9C", note: "Prêt à valider" },
  { id: "q4", patient: "Sara T.", category: "Surveillance spéciale", room: "11A", note: "Monitorage neurologique" },
  { id: "q5", patient: "Joel M.", category: "Critiques", room: "5D", note: "Fièvre 39°C" },
  { id: "q6", patient: "Nadia S.", category: "Hospitalisés", room: "8B", note: "Suivi insuline" },
];

export default function DashboardMedecin() {
  const navigate = useNavigate();
  const [searchConsult, setSearchConsult] = useState("");
  const [treatmentSearch, setTreatmentSearch] = useState("");
  const [treatmentPage, setTreatmentPage] = useState(0);
  const [selectedPatient, setSelectedPatient] = useState<PatientDetail | null>(null);
  const [selectedExam, setSelectedExam] = useState<ResultItem | null>(null);
  const [selectedPrescription, setSelectedPrescription] = useState<PrescriptionItem | null>(null);
  const [selectedAlert, setSelectedAlert] = useState<AlertItem | null>(null);
  const [quickModalOpen, setQuickModalOpen] = useState(false);
  const [quickFilter, setQuickFilter] = useState<"all" | "Hospitalisés" | "Critiques" | "Sortie prévue" | "Surveillance spéciale">("all");
  const [prescriptionDone, setPrescriptionDone] = useState<Record<string, boolean>>({});

  const filteredConsultations = useMemo(
    () => consultationsToday.filter((consult) =>
      [consult.patient, consult.reason, consult.status].some((field) =>
        field.toLowerCase().includes(searchConsult.toLowerCase())
      )
    ),
    [searchConsult]
  );

  const filteredTreatments = useMemo(
    () => prescriptionsActive.filter((item) =>
      [item.patient, item.therapy, item.status].some((field) =>
        field.toLowerCase().includes(treatmentSearch.toLowerCase())
      )
    ),
    [treatmentSearch]
  );

  const treatmentPages = Math.max(1, Math.ceil(filteredTreatments.length / 3));
  const visibleTreatments = filteredTreatments.slice(treatmentPage * 3, treatmentPage * 3 + 3);
  const quickPatientsFiltered = quickFilter === "all" ? quickPatients : quickPatients.filter((patient) => patient.category === quickFilter);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <PageMeta title="Dashboard médical | D7 Clinique" description="Tour de contrôle clinique du médecin" />
      <div className="p-4 sm:p-6">
        <PageBreadcrumb pageTitle="Dashboard médical" />
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-3xl border bg-red-50 p-4">
            <p className="text-xs text-red-600">Patients critiques</p>
            <p className="mt-2 text-3xl font-semibold">{criticalPatients.length}</p>
          </div>
          <div className="rounded-3xl border bg-slate-50 p-4">
            <p className="text-xs text-slate-500">Consultations aujourd'hui</p>
            <p className="mt-2 text-3xl font-semibold">{consultationsToday.length}</p>
          </div>
          <div className="rounded-3xl border bg-amber-50 p-4">
            <p className="text-xs text-amber-700">Résultats récents</p>
            <p className="mt-2 text-3xl font-semibold">{examResults.length}</p>
          </div>
          <div className="rounded-3xl border bg-slate-50 p-4">
            <p className="text-xs text-slate-500">Prescriptions à surveiller</p>
            <p className="mt-2 text-3xl font-semibold">{prescriptionsActive.length}</p>
          </div>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.95fr]">
          <div className="space-y-6">
            <div className="rounded-3xl border bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Critique</p>
                  <h3 className="mt-2 text-xl font-semibold">Patients nécessitant votre attention</h3>
                </div>
                <button onClick={() => navigate("/doctor/patients")} className="rounded-2xl border px-4 py-2 text-sm text-slate-700">Voir tous</button>
              </div>
              <div className="mt-5 space-y-3">
                {criticalPatients.slice(0, 3).map((item) => (
                  <div key={item.id} className="rounded-3xl border p-4 hover:bg-slate-50">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold">{item.patient}</p>
                        <p className="mt-1 text-xs text-slate-500">{item.label}</p>
                      </div>
                      <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">{item.status}</span>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <p className="text-xs text-slate-500">Dossier infirmier rapide</p>
                      <button onClick={() => setSelectedPatient(patientDetails[item.patient] ?? null)} className="rounded-2xl border px-3 py-2 text-sm">Voir dossier</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Agenda clinique</p>
                  <h3 className="mt-2 text-xl font-semibold">Consultations du jour</h3>
                </div>
                <div className="rounded-2xl bg-slate-100 px-3 py-2 text-xs text-slate-600">Aujourd'hui</div>
              </div>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="inline-flex items-center gap-2 rounded-2xl bg-slate-100 px-3 py-2 text-slate-600">
                  <CalenderIcon className="size-5" />
                  <span className="text-xs">Filtrer</span>
                </div>
                <input
                  value={searchConsult}
                  onChange={(e) => setSearchConsult(e.target.value)}
                  placeholder="Patient, motif ou statut"
                  className="flex-1 rounded-2xl border px-4 py-2"
                />
              </div>
              <div className="mt-5 space-y-3">
                {filteredConsultations.map((consult) => (
                  <button key={consult.id} onClick={() => navigate(`/doctor/consultations/${consult.id}`)} className="w-full rounded-3xl border p-4 text-left hover:bg-slate-50">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold">{consult.time} — {consult.patient}</p>
                        <p className="mt-1 text-xs text-slate-500">{consult.reason}</p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{consult.status}</span>
                    </div>
                  </button>
                ))}
                {filteredConsultations.length === 0 && <div className="rounded-3xl border bg-slate-50 p-4 text-sm text-slate-500">Aucun rendez-vous trouvé.</div>}
              </div>
            </div>

            <div className="rounded-3xl border bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Résultats examens</p>
                  <h3 className="mt-2 text-xl font-semibold">Examens récents</h3>
                </div>
                <button onClick={() => navigate("/doctor/exams")} className="rounded-2xl border px-4 py-2 text-sm text-slate-700">Voir tous</button>
              </div>
              <div className="mt-5 space-y-3">
                {examResults.slice(0, 3).map((result) => (
                  <button key={result.id} onClick={() => setSelectedExam(result)} className="w-full rounded-3xl border p-4 text-left hover:bg-slate-50">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold">{result.test}</p>
                        <p className="mt-1 text-xs text-slate-500">{result.patient}</p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${result.flag === "critique" ? "bg-red-100 text-red-700" : result.flag === "attention" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                        {result.flag}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <aside className="space-y-6">
            <div className="rounded-3xl border bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Suivi des traitements</p>
                  <h3 className="mt-2 text-xl font-semibold">Prescriptions actives</h3>
                </div>
                <button onClick={() => navigate("/doctor/prescriptions")} className="rounded-2xl border px-4 py-2 text-sm text-slate-700">Voir liste</button>
              </div>
              <div className="mt-4">
                <input
                  value={treatmentSearch}
                  onChange={(e) => { setTreatmentSearch(e.target.value); setTreatmentPage(0); }}
                  placeholder="Recherche patient ou traitement"
                  className="w-full rounded-2xl border px-4 py-2"
                />
              </div>
              <div className="mt-5 space-y-3">
                {visibleTreatments.map((item) => (
                  <button key={item.id} onClick={() => setSelectedPrescription(item)} className="w-full rounded-3xl border p-4 text-left hover:bg-slate-50">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold">{item.patient}</p>
                        <p className="mt-1 text-xs text-slate-500">{item.therapy}</p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{item.status}</span>
                    </div>
                  </button>
                ))}
              </div>
              <div className="mt-5 flex items-center justify-between gap-3 text-sm text-slate-600">
                <button onClick={() => setTreatmentPage((prev) => Math.max(0, prev - 1))} className="rounded-2xl border px-4 py-2">Retour</button>
                <span>Page {treatmentPage + 1} / {treatmentPages}</span>
                <button onClick={() => setTreatmentPage((prev) => Math.min(treatmentPages - 1, prev + 1))} className="rounded-2xl border px-4 py-2">Suivant</button>
              </div>
            </div>

            <div className="rounded-3xl border bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Rapide</p>
                  <h3 className="mt-2 text-xl font-semibold">Vue clinique rapide</h3>
                </div>
                <button onClick={() => setQuickModalOpen(true)} className="rounded-2xl border px-4 py-2 text-sm text-slate-700">Ouvrir</button>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {quickMetrics.map((metric) => (
                  <div key={metric.label} className="rounded-3xl border bg-slate-50 p-4">
                    <p className="text-xs text-slate-500">{metric.label}</p>
                    <p className="mt-2 text-2xl font-semibold">{metric.value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Alertes médicales</p>
                  <h3 className="mt-2 text-xl font-semibold">Alerte</h3>
                </div>
                <BellIcon className="h-5 w-5 text-red-600" />
              </div>
              <div className="mt-5 space-y-3">
                {medicalAlerts.map((alert) => (
                  <button key={alert.id} onClick={() => setSelectedAlert(alert)} className="w-full rounded-3xl border p-4 text-left hover:bg-slate-50">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold">{alert.label}</p>
                        <p className="mt-1 text-xs text-slate-500">{alert.source}</p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">Détails</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </aside>
        </div>

      </div>

      {selectedPatient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-6">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs text-slate-500">Dossier infirmier</p>
                <h3 className="mt-1 text-xl font-semibold">{selectedPatient.patient}</h3>
                <p className="mt-1 text-sm text-slate-500">{selectedPatient.service} · {selectedPatient.room}</p>
              </div>
              <button onClick={() => setSelectedPatient(null)} className="rounded-2xl border px-3 py-2">Fermer</button>
            </div>
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <div className="rounded-3xl border bg-slate-50 p-4">
                <p className="text-xs text-slate-500">Résumé infirmier</p>
                <p className="mt-2 text-sm text-slate-700">{selectedPatient.nurseSummary}</p>
              </div>
              <div className="rounded-3xl border bg-slate-50 p-4">
                <p className="text-xs text-slate-500">Résultats</p>
                <p className="mt-2 text-sm text-slate-700">{selectedPatient.infirmaryResults}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedExam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-6">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs text-slate-500">Détail examen</p>
                <h3 className="mt-1 text-xl font-semibold">{selectedExam.test}</h3>
                <p className="mt-1 text-sm text-slate-500">{selectedExam.patient}</p>
              </div>
              <button onClick={() => setSelectedExam(null)} className="rounded-2xl border px-3 py-2">Fermer</button>
            </div>
            <div className="mt-6 rounded-3xl border bg-slate-50 p-4">
              <p className="text-xs text-slate-500">Interprétation</p>
              <p className="mt-2 text-sm text-slate-700">{selectedExam.flag === "critique" ? "Intervention urgente recommandée." : selectedExam.flag === "attention" ? "Surveillance renforcée." : "Normalité dans les limites attendues."}</p>
            </div>
          </div>
        </div>
      )}

      {selectedPrescription && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-6">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs text-slate-500">Prescription</p>
                <h3 className="mt-1 text-xl font-semibold">{selectedPrescription.patient}</h3>
                <p className="mt-1 text-sm text-slate-500">{selectedPrescription.therapy}</p>
              </div>
              <button onClick={() => setSelectedPrescription(null)} className="rounded-2xl border px-3 py-2">Fermer</button>
            </div>
            <div className="mt-6 rounded-3xl border bg-slate-50 p-4">
              <p className="text-xs text-slate-500">Statut</p>
              <p className="mt-2 text-sm text-slate-700">{selectedPrescription.status}</p>
            </div>
            <div className="mt-4 flex gap-3">
              <button onClick={() => setPrescriptionDone((prev) => ({ ...prev, [selectedPrescription.id]: !prev[selectedPrescription.id] }))} className="flex-1 rounded-2xl bg-slate-900 text-white px-4 py-2">{prescriptionDone[selectedPrescription.id] ? "Suivi marqué" : "Marquer suivi effectué"}</button>
              <button onClick={() => setSelectedPrescription(null)} className="flex-1 rounded-2xl border px-4 py-2">Annuler</button>
            </div>
          </div>
        </div>
      )}

      {selectedAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-6">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs text-slate-500">Alerte</p>
                <h3 className="mt-1 text-xl font-semibold">{selectedAlert.label}</h3>
                <p className="mt-1 text-sm text-slate-500">Source : {selectedAlert.source}</p>
              </div>
              <button onClick={() => setSelectedAlert(null)} className="rounded-2xl border px-3 py-2">Fermer</button>
            </div>
            <div className="mt-6 rounded-3xl border bg-slate-50 p-4">
              <p className="text-xs text-slate-500">Détails</p>
              <p className="mt-2 text-sm text-slate-700">{selectedAlert.source === "Labo" ? "Résultat critique transmis, aligner traitement immédiatement." : selectedAlert.source === "Pharmacie" ? "Vérifier interaction avec les traitements actuels." : "Contrôler administration et notifier l’équipe infirmière."}</p>
            </div>
          </div>
        </div>
      )}

      {quickModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-6">
          <div className="w-full max-w-3xl rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs text-slate-500">Vue rapide</p>
                <h3 className="mt-1 text-xl font-semibold">Patients hospitalisés</h3>
              </div>
              <button onClick={() => setQuickModalOpen(false)} className="rounded-2xl border px-3 py-2">Fermer</button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {(["all", "Hospitalisés", "Critiques", "Sortie prévue", "Surveillance spéciale"] as const).map((filter) => (
                <button key={filter} onClick={() => setQuickFilter(filter)} className={`rounded-2xl px-3 py-2 text-sm ${quickFilter === filter ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}>
                  {filter}
                </button>
              ))}
            </div>
            <div className="mt-5 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="px-3 py-3 text-slate-500">Patient</th>
                    <th className="px-3 py-3 text-slate-500">Catégorie</th>
                    <th className="px-3 py-3 text-slate-500">Chambre</th>
                    <th className="px-3 py-3 text-slate-500">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {quickPatientsFiltered.map((patient) => (
                    <tr key={patient.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-3">{patient.patient}</td>
                      <td className="px-3 py-3">{patient.category}</td>
                      <td className="px-3 py-3">{patient.room}</td>
                      <td className="px-3 py-3">{patient.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
