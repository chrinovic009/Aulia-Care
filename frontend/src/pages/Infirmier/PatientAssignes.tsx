import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { getAllPatients, PatientRecord, updatePatientRecord } from "../../api/reception";

const patientStatuses: Record<string, string> = {
  "Fiche validée": "bg-emerald-100 text-emerald-700",
  "En suivi": "bg-amber-100 text-amber-700",
  "Fiche en attente": "bg-slate-100 text-slate-900",
  "Fiche annulé": "bg-red-100 text-red-700",
};

export default function PatientAssignes() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("Tous");
  const [priorityFilter, setPriorityFilter] = useState("Tous");
  const [serviceFilter, setServiceFilter] = useState("Tous");

  const [patients, setPatients] = useState<PatientRecord[]>([]);

  // Modals state
  const [selectedPatientForModal, setSelectedPatientForModal] = useState<PatientRecord | null>(null);
  const [openModal, setOpenModal] = useState<"file" | "observation" | "medication" | "urgency" | null>(null);

  // Form states
  const [observationForm, setObservationForm] = useState({ content: "", time: new Date().toLocaleTimeString("fr-FR") });
  const [medicationForm, setMedicationForm] = useState({ medication: "", dosage: "", route: "IV", time: new Date().toLocaleTimeString("fr-FR"), notes: "" });
  const [urgencyForm, setUrgencyForm] = useState({ reason: "", severity: "Haute", details: "" });

  // Track urgent patients
  const [urgentPatients, setUrgentPatients] = useState<Set<string>>(new Set());

  const priorities = useMemo(
    () => ["Tous", ...new Set(patients.map((patient) => patient.priority || "Normal"))],
    [patients]
  );
  const services = useMemo(
    () => ["Tous", ...new Set(patients.map((patient) => patient.service || "Inconnu"))],
    [patients]
  );

  const counts = useMemo(
    () => ({
      total: patients.length,
      validated: patients.filter((patient) => patient.status === "Fiche validée").length,
      inProgress: patients.filter((patient) => patient.status === "En suivi").length,
      pending: patients.filter((patient) => patient.status === "Fiche en attente").length,
    }),
    [patients]
  );

  const formatRelativeTime = (ts?: number) => {
    if (!ts) return "";
    const sec = Math.floor((Date.now() - ts) / 1000);
    if (sec < 60) return `il y a ${sec} sec${sec > 1 ? 's' : ''}`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `il y a ${min} min`;
    const hrs = Math.floor(min / 60);
    if (hrs < 24) return `il y a ${hrs} heure${hrs > 1 ? 's' : ''}`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `il y a ${days} jour${days > 1 ? 's' : ''}`;
    const months = Math.floor(days / 30);
    return `il y a ${months} mois`;
  };

  const filteredPatients = useMemo(() => {
    return patients
      .filter((patient) => {
        const query = searchQuery.toLowerCase();
        const matchesSearch =
          patient.name.toLowerCase().includes(query) ||
          (patient.priority || "").toLowerCase().includes(query) ||
          (patient.service || "").toLowerCase().includes(query) ||
          (patient.doctor || "").toLowerCase().includes(query);
        const matchesStatus =
          statusFilter === "Tous" || patient.status === statusFilter;
        const matchesPriority = priorityFilter === "Tous" || patient.priority === priorityFilter;
        const matchesService =
          serviceFilter === "Tous" || patient.service === serviceFilter;
        return matchesSearch && matchesStatus && matchesPriority && matchesService;
      })
      .sort((a, b) => {
        const order: Record<string, number> = {
          "Fiche validée": 0,
          "En suivi": 1,
          "Fiche en attente": 2,
          "Fiche annulé": 3,
          Enregistré: 4,
        };
        return (order[a.status || "Enregistré"] || 5) - (order[b.status || "Enregistré"] || 5);
      });
  }, [searchQuery, statusFilter, priorityFilter, serviceFilter]);

  // Handlers
  const openFileModal = (patient: PatientRecord) => {
    setSelectedPatientForModal(patient);
    setOpenModal("file");
  };

  const openObservationModal = (patient: PatientRecord) => {
    setSelectedPatientForModal(patient);
    setObservationForm({ content: "", time: new Date().toLocaleTimeString("fr-FR") });
    setOpenModal("observation");
  };

  const openMedicationModal = (patient: PatientRecord) => {
    setSelectedPatientForModal(patient);
    setMedicationForm({ medication: "", dosage: "", route: "IV", time: new Date().toLocaleTimeString("fr-FR"), notes: "" });
    setOpenModal("medication");
  };

  const handleContactDoctor = (patient: PatientRecord) => {
    const patientInfo = `Patient: ${patient.name} (${patient.priority || "Normal"})\nService: ${patient.service || "Inconnu"}\nMédecin: ${patient.doctor || "N/A"}\nStatut: ${patient.status}`;
    navigate("/nurse/messages", { state: { patientInfo, patientId: patient.id } });
  };

  const openUrgencyModal = (patient: PatientRecord) => {
    setSelectedPatientForModal(patient);
    setUrgencyForm({ reason: "", severity: "Haute", details: "" });
    setOpenModal("urgency");
  };

  // Vitals modal for nurses: quick entry with suggestions
  const [openVitalsPatientId, setOpenVitalsPatientId] = useState<string | null>(null);
  const [vitalsForm, setVitalsForm] = useState({ temperature: "", bloodPressure: "", spo2: "", heartRate: "", notes: "", alerts: [] as string[] });
  const [receptionQueue, setReceptionQueue] = useState<Record<string, number>>({});

  const openVitalsModal = (patient: PatientRecord) => {
    setOpenVitalsPatientId(patient.id);
    setVitalsForm({
      temperature: patient.temperature || "",
      bloodPressure: patient.bloodPressure || "",
      spo2: patient.spo2 || "",
      heartRate: patient.heartRate || "",
      notes: "",
      alerts: [],
    });
  };

  const handleSaveVitals = () => {
    if (!openVitalsPatientId) return;
    setPatients((prev) => prev.map((p) =>
      p.id === openVitalsPatientId
        ? { ...p, temperature: vitalsForm.temperature, bloodPressure: vitalsForm.bloodPressure, spo2: vitalsForm.spo2, heartRate: vitalsForm.heartRate, status: "En suivi" }
        : p
    ));
    updatePatientRecord({
      id: openVitalsPatientId,
      temperature: vitalsForm.temperature,
      bloodPressure: vitalsForm.bloodPressure,
      spo2: vitalsForm.spo2,
      heartRate: vitalsForm.heartRate,
      status: "En suivi",
      lastUpdate: `Signes vitaux mis à jour le ${new Date().toLocaleTimeString()}`,
    });
    setReceptionQueue((prev) => {
      const n = { ...prev };
      delete n[openVitalsPatientId];
      return n;
    });
    setOpenVitalsPatientId(null);
  };

  const handleDeclareUrgency = () => {
    if (!selectedPatientForModal) return;
    setUrgentPatients((prev) => new Set(prev).add(selectedPatientForModal.id));
    setOpenModal(null);
  };

  const refreshPatients = () => {
    const loaded = getAllPatients().filter(
      (patient) => patient.status === "Fiche validée" || patient.status === "En suivi"
    );
    setPatients(loaded);
    setReceptionQueue(
      loaded.reduce((acc: Record<string, number>, patient) => {
        acc[patient.id] = new Date(patient.createdAt).getTime();
        return acc;
      }, {} as Record<string, number>)
    );
  };

  useEffect(() => {
    refreshPatients();
    const handler = () => refreshPatients();
    window.addEventListener("d7:patientReadyForVitals", handler as EventListener);
    return () => window.removeEventListener("d7:patientReadyForVitals", handler as EventListener);
  }, []);

  const handleSubmitObservation = () => {
    // Traiter l'observation (à intégrer avec un backend)
    console.log("Observation ajoutée:", { patient: selectedPatientForModal?.name, ...observationForm });
    setOpenModal(null);
  };

  const handleSubmitMedication = () => {
    // Traiter l'administration de médicament
    console.log("Médicament administré:", { patient: selectedPatientForModal?.name, ...medicationForm });
    setOpenModal(null);
  };

  const handleSubmitUrgency = () => {
    // Traiter la déclaration d'urgence
    console.log("Urgence déclarée:", { patient: selectedPatientForModal?.name, ...urgencyForm });
    handleDeclareUrgency();
  };

  const closeModal = () => {
    setOpenModal(null);
    setSelectedPatientForModal(null);
  };

  return (
    <div className="p-4 sm:p-6 bg-slate-50 dark:bg-slate-950 min-h-screen">
      <PageMeta
        title="Patients assignés | D7 Clinique"
        description="Liste opérationnelle des patients assignés à l'infirmière avec priorisation clinique et actions rapides."
      />
      <PageBreadcrumb pageTitle="Patients assignés" />

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
              Qui dépend de moi maintenant ?
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">
              Patients assignés
            </h1>
          </div>
          
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
              <p className="text-sm text-slate-500 dark:text-slate-400">Total patients</p>
              <p className="mt-2 text-3xl font-semibold text-slate-900 dark:text-white">{counts.total}</p>
            </div>
            <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-900/10">
              <p className="text-sm font-semibold uppercase tracking-[0.15em] text-amber-700 dark:text-amber-200">En attente</p>
              <p className="mt-2 text-3xl font-semibold text-amber-700">{counts.pending}</p>
            </div>
            <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-700 dark:bg-emerald-900/10">
              <p className="text-sm font-semibold uppercase tracking-[0.15em] text-emerald-700 dark:text-emerald-200">Validées</p>
              <p className="mt-2 text-3xl font-semibold text-emerald-700">{counts.validated}</p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
              <p className="text-sm font-semibold uppercase tracking-[0.15em] text-slate-700 dark:text-slate-200">En suivi</p>
              <p className="mt-2 text-3xl font-semibold text-slate-900 dark:text-white">{counts.inProgress}</p>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">

          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">

              <label className="block">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Recherche</span>
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Nom, chambre, service"
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">État</span>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                >
                  {['Tous', 'Fiche en attente', 'Fiche validée', 'En suivi', 'Fiche annulé'].map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Chambre</span>
                <select
                  value={priorityFilter}
                  onChange={(event) => setPriorityFilter(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                >
                  {priorities.map((priority) => (
                    <option key={priority} value={priority}>{priority}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Service</span>
                <select
                  value={serviceFilter}
                  onChange={(event) => setServiceFilter(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                >
                  {services.map((service) => (
                    <option key={service} value={service}>{service}</option>
                  ))}
                </select>
              </label>

            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Résultats</p>
              <p className="mt-2 text-base text-slate-500 dark:text-slate-400">
                {filteredPatients.length} patient(s) correspondent aux filtres.
              </p>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-700 dark:bg-slate-950">
            <p className="font-semibold text-slate-900 dark:text-white">Instructions rapides</p>
            <ul className="mt-4 space-y-3 text-slate-600 dark:text-slate-300">
              <li>Priorité aux cas critiques en haut de liste.</li>
              <li>Filtrer par chambre ou service avant de commencer la ronde.</li>
              <li>Accéder au dossier ou déclarer urgence en un clic.</li>
            </ul>
          </div>

        </div>
      </section>

      {/* Quick access bubbles (patients envoyés par la réception) */}
      <div className="mt-6 mb-4 flex items-center gap-3 overflow-x-auto py-2">
        {patients.filter((p) => !!receptionQueue[p.id]).map((p) => {
          const isUrg = urgentPatients.has(p.id);
          const pillClass = isUrg ? "bg-red-100 text-red-700" : patientStatuses[p.status || "Fiche en attente"] || "bg-slate-100 text-slate-900";
          const initials = p.name
            .split(" ")
            .map((part) => part[0])
            .join("")
            .slice(0, 2)
            .toUpperCase();
          return (
            <button
              key={p.id}
              onClick={() => openVitalsModal(p)}
              className={`flex-shrink-0 inline-flex items-center gap-3 rounded-full border px-3 py-2 ${pillClass} hover:opacity-95`}
            >
              <div className="h-8 w-8 flex items-center justify-center rounded-full bg-white text-sm font-semibold text-slate-900">{p.avatar || initials}</div>
              <div className="text-left">
                <div className="text-sm font-semibold">{p.name}</div>
                <div className="text-xs">{p.service || "Accueil"} • <span className="font-medium">{p.status}</span></div>
                <div className="text-xs text-slate-500">{formatRelativeTime(receptionQueue[p.id])}</div>
              </div>
            </button>
          );
        })}
      </div>

      <section className="mt-6 space-y-4">
        {filteredPatients.map((patient) => {
          const isUrgent = urgentPatients.has(patient.id);
          const patientStatus = isUrgent ? "Critique" : patient.status || "Fiche en attente";
          
          return (
            <article
              key={patient.id}
              className={`rounded-[28px] border ${isUrgent ? "border-red-300 bg-red-50/50 dark:border-red-700 dark:bg-red-900/5" : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"} p-5 shadow-sm transition hover:border-slate-300 dark:hover:border-slate-700`}
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-100 text-xl font-bold text-slate-900 dark:bg-slate-800 dark:text-white">
                    {patient.avatar}
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-slate-900 dark:text-white">{patient.name}</p>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      {patient.gender || "Sexe inconnu"} • Service {patient.service || "Inconnu"} • Dr {patient.doctor || "N/A"}
                    </p>
                  </div>
                </div>
                <span className={`inline-flex items-center rounded-full px-3 py-2 text-sm font-semibold ${isUrgent ? "bg-red-100 text-red-700" : patientStatuses[patientStatus] || "bg-slate-100 text-slate-900"}`}>
                  {patientStatus}
                </span>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-[1fr_0.8fr]">
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">Constantes rapides</p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-3xl bg-white p-3 dark:bg-slate-900">
                      <p className="text-xs text-slate-500 dark:text-slate-400">T°</p>
                      <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">{patient.temperature}</p>
                    </div>
                    <div className="rounded-3xl bg-white p-3 dark:bg-slate-900">
                      <p className="text-xs text-slate-500 dark:text-slate-400">TA</p>
                      <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">{patient.bloodPressure}</p>
                    </div>
                    <div className="rounded-3xl bg-white p-3 dark:bg-slate-900">
                      <p className="text-xs text-slate-500 dark:text-slate-400">SpO2</p>
                      <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">{patient.spo2}</p>
                    </div>
                    <div className="rounded-3xl bg-white p-3 dark:bg-slate-900">
                      <p className="text-xs text-slate-500 dark:text-slate-400">FC</p>
                      <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">{patient.heartRate}</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">Prochaine action</p>
                  <p className="mt-3 text-base text-slate-700 dark:text-slate-200">{patient.nextAction}</p>
                  <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">{patient.lastUpdate}</p>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  onClick={() => openFileModal(patient)}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:border-slate-300 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                >
                  Voir dossier
                </button>
                <button
                  onClick={() => openObservationModal(patient)}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:border-slate-300 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                >
                  Ajouter observation
                </button>
                <button
                  onClick={() => openMedicationModal(patient)}
                  className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 transition hover:border-amber-300 dark:border-amber-700 dark:bg-amber-900/10"
                >
                  Administrer médicament
                </button>
                <button
                  onClick={() => handleContactDoctor(patient)}
                  className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 transition hover:border-sky-300 dark:border-sky-700 dark:bg-sky-900/10"
                >
                  Contacter médecin
                </button>
                <button
                  onClick={() => openUrgencyModal(patient)}
                  className="rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:border-red-300 dark:border-red-700 dark:bg-red-900/10"
                >
                  Déclarer urgence
                </button>
              </div>
            </article>
          );
        })}
      </section>

      {/* FILE MODAL */}
      {openModal === "file" && selectedPatientForModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-6">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl dark:bg-slate-900">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Dossier patient</p>
                <h3 className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">{selectedPatientForModal.name}</h3>
              </div>
              <button
                onClick={closeModal}
                className="rounded-2xl border border-slate-300 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:text-slate-200"
              >
                Fermer
              </button>
            </div>
            <div className="space-y-4">
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
                <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Infos essentielles</p>
                <div className="mt-4 space-y-2 text-sm text-slate-900 dark:text-white">
                  <p>Date de naissance: <span className="font-semibold">{selectedPatientForModal.dob || "Non renseignée"}</span></p>
                  <p>Sexe: <span className="font-semibold">{selectedPatientForModal.gender || "Non spécifié"}</span></p>
                  <p>Service: <span className="font-semibold">{selectedPatientForModal.service || "Inconnu"}</span></p>
                  <p>Médecin: <span className="font-semibold">{selectedPatientForModal.doctor || "N/A"}</span></p>
                  <p>État: <span className="font-semibold">{selectedPatientForModal.status}</span></p>
                </div>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
                <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Constantes actuelles</p>
                <div className="mt-4 grid gap-2 text-sm text-slate-900 dark:text-white">
                  <p>Température: <span className="font-semibold">{selectedPatientForModal.temperature}</span></p>
                  <p>Tension: <span className="font-semibold">{selectedPatientForModal.bloodPressure}</span></p>
                  <p>SpO2: <span className="font-semibold">{selectedPatientForModal.spo2}</span></p>
                  <p>FC: <span className="font-semibold">{selectedPatientForModal.heartRate}</span></p>
                </div>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
                <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Prochaine action</p>
                <p className="mt-2 text-base text-slate-900 dark:text-white">{selectedPatientForModal.nextAction}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* OBSERVATION MODAL */}
      {openModal === "observation" && selectedPatientForModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-6">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl dark:bg-slate-900">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Ajouter observation</p>
                <h3 className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">{selectedPatientForModal.name}</h3>
              </div>
              <button
                onClick={closeModal}
                className="rounded-2xl border border-slate-300 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:text-slate-200"
              >
                Fermer
              </button>
            </div>
            <div className="space-y-4">
              <label className="block">
                <span className="text-sm font-semibold text-slate-900 dark:text-white">Observation</span>
                <textarea
                  value={observationForm.content}
                  onChange={(e) => setObservationForm({ ...observationForm, content: e.target.value })}
                  placeholder="Décrivez l'observation..."
                  rows={5}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-900 dark:text-white">Heure</span>
                <input
                  type="time"
                  value={observationForm.time}
                  onChange={(e) => setObservationForm({ ...observationForm, time: e.target.value })}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </label>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleSubmitObservation}
                  className="flex-1 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-slate-700"
                >
                  Enregistrer
                </button>
                <button
                  onClick={closeModal}
                  className="flex-1 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                >
                  Annuler
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MEDICATION MODAL */}
      {openModal === "medication" && selectedPatientForModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-6">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl dark:bg-slate-900">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Administrer médicament</p>
                <h3 className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">{selectedPatientForModal.name}</h3>
              </div>
              <button
                onClick={closeModal}
                className="rounded-2xl border border-slate-300 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:text-slate-200"
              >
                Fermer
              </button>
            </div>
            <div className="space-y-4">
              <label className="block">
                <span className="text-sm font-semibold text-slate-900 dark:text-white">Médicament</span>
                <input
                  type="text"
                  value={medicationForm.medication}
                  onChange={(e) => setMedicationForm({ ...medicationForm, medication: e.target.value })}
                  placeholder="Nom du médicament"
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-900 dark:text-white">Dosage</span>
                <input
                  type="text"
                  value={medicationForm.dosage}
                  onChange={(e) => setMedicationForm({ ...medicationForm, dosage: e.target.value })}
                  placeholder="Ex: 5mg"
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-900 dark:text-white">Route d'administration</span>
                <select
                  value={medicationForm.route}
                  onChange={(e) => setMedicationForm({ ...medicationForm, route: e.target.value })}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                >
                  <option>IV</option>
                  <option>IM</option>
                  <option>SC</option>
                  <option>PO</option>
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-900 dark:text-white">Heure</span>
                <input
                  type="time"
                  value={medicationForm.time}
                  onChange={(e) => setMedicationForm({ ...medicationForm, time: e.target.value })}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-900 dark:text-white">Notes supplémentaires</span>
                <textarea
                  value={medicationForm.notes}
                  onChange={(e) => setMedicationForm({ ...medicationForm, notes: e.target.value })}
                  placeholder="Notes optionnelles..."
                  rows={3}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </label>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleSubmitMedication}
                  className="flex-1 rounded-2xl bg-amber-600 px-4 py-3 text-sm font-semibold text-white hover:bg-amber-700 dark:bg-amber-700"
                >
                  Enregistrer
                </button>
                <button
                  onClick={closeModal}
                  className="flex-1 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                >
                  Annuler
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* URGENCY MODAL */}
      {openModal === "urgency" && selectedPatientForModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-6">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl dark:bg-slate-900">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-600">Déclarer urgence</p>
                <h3 className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">{selectedPatientForModal.name}</h3>
              </div>
              <button
                onClick={closeModal}
                className="rounded-2xl border border-red-300 px-3 py-2 text-sm text-red-700 dark:border-red-700 dark:text-red-300"
              >
                Annuler
              </button>
            </div>
            <div className="rounded-3xl border border-red-200 bg-red-50/50 p-4 dark:border-red-700 dark:bg-red-900/10">
              <p className="text-sm font-semibold text-red-700 dark:text-red-300">Attention: Ceci passera le patient en état critique.</p>
            </div>
            <div className="mt-4 space-y-4">
              <label className="block">
                <span className="text-sm font-semibold text-slate-900 dark:text-white">Motif de l'urgence</span>
                <input
                  type="text"
                  value={urgencyForm.reason}
                  onChange={(e) => setUrgencyForm({ ...urgencyForm, reason: e.target.value })}
                  placeholder="Ex: Chute, Arrêt cardiaque..."
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-900 dark:text-white">Niveau de sévérité</span>
                <select
                  value={urgencyForm.severity}
                  onChange={(e) => setUrgencyForm({ ...urgencyForm, severity: e.target.value })}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                >
                  <option>Haute</option>
                  <option>Très élevée</option>
                  <option>Critique</option>
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-900 dark:text-white">Détails</span>
                <textarea
                  value={urgencyForm.details}
                  onChange={(e) => setUrgencyForm({ ...urgencyForm, details: e.target.value })}
                  placeholder="Décrivez la situation d'urgence..."
                  rows={4}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </label>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleSubmitUrgency}
                  className="flex-1 rounded-2xl bg-red-700 px-4 py-3 text-sm font-semibold text-white hover:bg-red-800"
                >
                  Confirmer urgence
                </button>
                <button
                  onClick={closeModal}
                  className="flex-1 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                >
                  Annuler
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* VITALS QUICK ENTRY MODAL */}
      {openVitalsPatientId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-6">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl dark:bg-slate-900">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Prise des constantes</p>
                <h3 className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">{patients.find(p => p.id === openVitalsPatientId)?.name}</h3>
              </div>
              <button
                onClick={() => setOpenVitalsPatientId(null)}
                className="rounded-2xl border border-slate-300 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:text-slate-200"
              >
                Fermer
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">Température (°C)</p>
                <div className="mt-2 flex gap-2">
                  {['36.5','37.0','38.0','39.0'].map(v => (
                    <button key={v} onClick={() => setVitalsForm(prev => ({ ...prev, temperature: v }))} className={`rounded-2xl px-3 py-2 text-sm ${v === vitalsForm.temperature ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-900'}`}>
                      {v}
                    </button>
                  ))}
                  <input value={vitalsForm.temperature} onChange={(e) => setVitalsForm(prev => ({ ...prev, temperature: e.target.value }))} placeholder="Autre" className="ml-2 w-40 rounded-2xl border border-slate-200 px-3 py-2 text-sm" />
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">Tension (TA)</p>
                <div className="mt-2 flex gap-2">
                  {['12/8','13/8','14/9','15/10'].map(v => (
                    <button key={v} onClick={() => setVitalsForm(prev => ({ ...prev, bloodPressure: v }))} className={`rounded-2xl px-3 py-2 text-sm ${v === vitalsForm.bloodPressure ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-900'}`}>
                      {v}
                    </button>
                  ))}
                  <input value={vitalsForm.bloodPressure} onChange={(e) => setVitalsForm(prev => ({ ...prev, bloodPressure: e.target.value }))} placeholder="Autre" className="ml-2 w-40 rounded-2xl border border-slate-200 px-3 py-2 text-sm" />
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">SpO2</p>
                <div className="mt-2 flex gap-2">
                  {['98%','95%','92%','88%'].map(v => (
                    <button key={v} onClick={() => setVitalsForm(prev => ({ ...prev, spo2: v }))} className={`rounded-2xl px-3 py-2 text-sm ${v === vitalsForm.spo2 ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-900'}`}>
                      {v}
                    </button>
                  ))}
                  <input value={vitalsForm.spo2} onChange={(e) => setVitalsForm(prev => ({ ...prev, spo2: e.target.value }))} placeholder="Autre" className="ml-2 w-42 rounded-2xl border border-slate-200 px-3 py-2 text-sm" />
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">Fréquence cardiaque (bpm)</p>
                <div className="mt-2 flex gap-2">
                  {['70','80','90','110'].map(v => (
                    <button key={v} onClick={() => setVitalsForm(prev => ({ ...prev, heartRate: v + ' bpm' }))} className={`rounded-2xl px-3 py-2 text-sm ${v + ' bpm' === vitalsForm.heartRate ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-900'}`}>
                      {v}
                    </button>
                  ))}
                  <input value={vitalsForm.heartRate} onChange={(e) => setVitalsForm(prev => ({ ...prev, heartRate: e.target.value }))} placeholder="Autre" className="ml-2 w-50 rounded-2xl border border-slate-200 px-3 py-2 text-sm" />
                </div>
              </div>

              <label className="block">
                <span className="text-sm font-semibold text-slate-900 dark:text-white">Notes rapides</span>
                <input value={vitalsForm.notes} onChange={(e) => setVitalsForm(prev => ({ ...prev, notes: e.target.value }))} placeholder="Ex: patient pâle, respiration rapide..." className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900" />
              </label>

              <div className="flex gap-3 pt-4">
                <button onClick={handleSaveVitals} className="flex-1 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800">Enregistrer</button>
                <button onClick={() => setOpenVitalsPatientId(null)} className="flex-1 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900">Annuler</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
