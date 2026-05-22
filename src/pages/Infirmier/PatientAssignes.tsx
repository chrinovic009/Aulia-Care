import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";

const patientData = [
  {
    id: "P-001",
    name: "Mme Sophie Kamanzi",
    age: 46,
    sex: "Femme",
    room: "422B",
    bed: "Lit 2",
    status: "Critique",
    service: "Cardiologie",
    temperature: "38.2°C",
    bloodPressure: "14/9",
    spo2: "91%",
    heartRate: "112 bpm",
    nextAction: "Injection morphine à 14h",
    lastUpdate: "Observation ajoutée il y a 12 min",
    avatar: "SK",
  },
  {
    id: "P-002",
    name: "Mr David Mputu",
    age: 62,
    sex: "Homme",
    room: "310A",
    bed: "Lit 1",
    status: "Surveillé",
    service: "Neurologie",
    temperature: "37.4°C",
    bloodPressure: "13/8",
    spo2: "95%",
    heartRate: "90 bpm",
    nextAction: "Contrôle glycémie dans 30 min",
    lastUpdate: "Traitement validé",
    avatar: "DM",
  },
  {
    id: "P-003",
    name: "Mme Amélie Tshibanda",
    age: 29,
    sex: "Femme",
    room: "205C",
    bed: "Lit 3",
    status: "Stable",
    service: "Pédiatrie",
    temperature: "36.8°C",
    bloodPressure: "11/7",
    spo2: "98%",
    heartRate: "76 bpm",
    nextAction: "Vérifier perfusion à 16h",
    lastUpdate: "Dose précédente administrée",
    avatar: "AT",
  },
  {
    id: "P-004",
    name: "Mr Jean-Baptiste Lungu",
    age: 54,
    sex: "Homme",
    room: "118A",
    bed: "Lit 1",
    status: "Critique",
    service: "Urgences",
    temperature: "39.1°C",
    bloodPressure: "15/10",
    spo2: "88%",
    heartRate: "118 bpm",
    nextAction: "Déclarer urgence + appel médecin",
    lastUpdate: "Alarme cardiaque active",
    avatar: "JL",
  },
  {
    id: "P-005",
    name: "Mme Clara Ndonda",
    age: 33,
    sex: "Femme",
    room: "210B",
    bed: "Lit 2",
    status: "Surveillé",
    service: "Chirurgie",
    temperature: "37.0°C",
    bloodPressure: "12/8",
    spo2: "93%",
    heartRate: "88 bpm",
    nextAction: "Contrôle plaie à 15h",
    lastUpdate: "Observation ajoutée il y a 8 min",
    avatar: "CN",
  },
];

const statusColors: Record<string, string> = {
  Stable: "bg-emerald-100 text-emerald-700",
  Surveillé: "bg-amber-100 text-amber-700",
  Critique: "bg-red-100 text-red-700",
};

export default function PatientAssignes() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("Tous");
  const [roomFilter, setRoomFilter] = useState("Tous");
  const [serviceFilter, setServiceFilter] = useState("Tous");

  // Modals state
  const [selectedPatientForModal, setSelectedPatientForModal] = useState<(typeof patientData)[0] | null>(null);
  const [openModal, setOpenModal] = useState<"file" | "observation" | "medication" | "urgency" | null>(null);

  // Form states
  const [observationForm, setObservationForm] = useState({ content: "", time: new Date().toLocaleTimeString("fr-FR") });
  const [medicationForm, setMedicationForm] = useState({ medication: "", dosage: "", route: "IV", time: new Date().toLocaleTimeString("fr-FR"), notes: "" });
  const [urgencyForm, setUrgencyForm] = useState({ reason: "", severity: "Haute", details: "" });

  // Track urgent patients
  const [urgentPatients, setUrgentPatients] = useState<Set<string>>(new Set());

  const rooms = useMemo(
    () => ["Tous", ...new Set(patientData.map((patient) => patient.room))],
    []
  );
  const services = useMemo(
    () => ["Tous", ...new Set(patientData.map((patient) => patient.service))],
    []
  );

  const counts = useMemo(
    () => ({
      total: patientData.length,
      critique: patientData.filter((patient) => patient.status === "Critique").length,
      surveille: patientData.filter((patient) => patient.status === "Surveillé").length,
      stable: patientData.filter((patient) => patient.status === "Stable").length,
    }),
    []
  );

  const filteredPatients = useMemo(() => {
    return patientData
      .filter((patient) => {
        const query = searchQuery.toLowerCase();
        const matchesSearch =
          patient.name.toLowerCase().includes(query) ||
          patient.room.toLowerCase().includes(query) ||
          patient.service.toLowerCase().includes(query);
        const matchesStatus =
          statusFilter === "Tous" || patient.status === statusFilter;
        const matchesRoom = roomFilter === "Tous" || patient.room === roomFilter;
        const matchesService =
          serviceFilter === "Tous" || patient.service === serviceFilter;
        return matchesSearch && matchesStatus && matchesRoom && matchesService;
      })
      .sort((a, b) => {
        const order = { Critique: 0, Surveillé: 1, Stable: 2 } as Record<string, number>;
        return order[a.status] - order[b.status];
      });
  }, [searchQuery, statusFilter, roomFilter, serviceFilter]);

  // Handlers
  const openFileModal = (patient: (typeof patientData)[0]) => {
    setSelectedPatientForModal(patient);
    setOpenModal("file");
  };

  const openObservationModal = (patient: (typeof patientData)[0]) => {
    setSelectedPatientForModal(patient);
    setObservationForm({ content: "", time: new Date().toLocaleTimeString("fr-FR") });
    setOpenModal("observation");
  };

  const openMedicationModal = (patient: (typeof patientData)[0]) => {
    setSelectedPatientForModal(patient);
    setMedicationForm({ medication: "", dosage: "", route: "IV", time: new Date().toLocaleTimeString("fr-FR"), notes: "" });
    setOpenModal("medication");
  };

  const handleContactDoctor = (patient: (typeof patientData)[0]) => {
    // Préparer les données du patient et rediriger vers MessagesInfirmier
    const patientInfo = `Patient: ${patient.name} (${patient.room})\nÂge: ${patient.age} ans\nÉtat: ${patient.status}`;
    navigate("/nurse/messages", { state: { patientInfo, patientId: patient.id } });
  };

  const openUrgencyModal = (patient: (typeof patientData)[0]) => {
    setSelectedPatientForModal(patient);
    setUrgencyForm({ reason: "", severity: "Haute", details: "" });
    setOpenModal("urgency");
  };

  const handleDeclareUrgency = () => {
    if (!selectedPatientForModal) return;
    setUrgentPatients((prev) => new Set(prev).add(selectedPatientForModal.id));
    setOpenModal(null);
  };

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
            <div className="rounded-3xl border border-red-200 bg-red-50 p-4 dark:border-red-700 dark:bg-red-900/10">
              <p className="text-sm font-semibold uppercase tracking-[0.15em] text-red-700 dark:text-red-200">Critiques</p>
              <p className="mt-2 text-3xl font-semibold text-red-700">{counts.critique}</p>
            </div>
            <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-900/10">
              <p className="text-sm font-semibold uppercase tracking-[0.15em] text-amber-700 dark:text-amber-200">Surveillés</p>
              <p className="mt-2 text-3xl font-semibold text-amber-700">{counts.surveille}</p>
            </div>
            <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-700 dark:bg-emerald-900/10">
              <p className="text-sm font-semibold uppercase tracking-[0.15em] text-emerald-700 dark:text-emerald-200">Stables</p>
              <p className="mt-2 text-3xl font-semibold text-emerald-700">{counts.stable}</p>
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
                  {['Tous', 'Critique', 'Surveillé', 'Stable'].map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Chambre</span>
                <select
                  value={roomFilter}
                  onChange={(event) => setRoomFilter(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                >
                  {rooms.map((room) => (
                    <option key={room} value={room}>{room}</option>
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

      <section className="mt-6 space-y-4">
        {filteredPatients.map((patient) => {
          const isUrgent = urgentPatients.has(patient.id);
          const patientStatus = isUrgent ? "Critique" : patient.status;
          
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
                      {patient.age} ans • {patient.sex} • Chambre {patient.room}, {patient.bed}
                    </p>
                  </div>
                </div>
                <span className={`inline-flex items-center rounded-full px-3 py-2 text-sm font-semibold ${isUrgent ? "bg-red-100 text-red-700" : statusColors[patientStatus]}`}>
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
                  <p>Âge: <span className="font-semibold">{selectedPatientForModal.age} ans</span></p>
                  <p>Sexe: <span className="font-semibold">{selectedPatientForModal.sex}</span></p>
                  <p>Chambre: <span className="font-semibold">{selectedPatientForModal.room}</span></p>
                  <p>Service: <span className="font-semibold">{selectedPatientForModal.service}</span></p>
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
    </div>
  );
}
