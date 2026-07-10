import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { playNotificationSound } from "../../utils/notificationSound";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import {
  fetchNurseOrientationHistory,
  fetchPatientsAwaitingVitals,
  formatPatientName,
  isUrgentPatient,
  NursePatient,
  NurseOrientationHistoryItem,
  recordPatientVitalSigns,
  RecordVitalSignsPayload,
} from "../../api/nurse";
import { apiFetch } from "../../config/api";
import { fetchServices } from "../../api/reception";

type VitalsForm = RecordVitalSignsPayload;

const emptyVitalsForm: VitalsForm = {
  temperature: "",
  bloodPressure: "",
  spo2: "",
  heartRate: "",
  respiratoryRate: "",
  weight: "",
  height: "",
  chestCircumference: "",
  armCircumference: "",
  notes: "",
  physicianId: "",
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "Non renseigne";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
};

const formatDate = (value?: string | null) => {
  if (!value) return "Non renseignee";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(value));
};

export default function PatientAssignes() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [patients, setPatients] = useState<NursePatient[]>([]);
  const [historyItems, setHistoryItems] = useState<NurseOrientationHistoryItem[]>([]);
  const [historyPeriod, setHistoryPeriod] = useState<'today' | 'yesterday' | 'week' | 'all'>('today');
  const [searchQuery, setSearchQuery] = useState("");
  const [serviceFilter, setServiceFilter] = useState("Tous");
  const [isLoading, setIsLoading] = useState(true);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPatient, setSelectedPatient] = useState<NursePatient | null>(null);
  const [detailsPatient, setDetailsPatient] = useState<NursePatient | null>(null);
  const [vitalsForm, setVitalsForm] = useState<VitalsForm>(emptyVitalsForm);
  const [physicians, setPhysicians] = useState<any[]>([]);
  const [servicesCatalog, setServicesCatalog] = useState<any[]>([]);

  const loadPatients = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchPatientsAwaitingVitals();
      setPatients(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de charger la file infirmier.");
    } finally {
      setIsLoading(false);
    }
  };

  const loadHistory = async (period: 'today' | 'yesterday' | 'week' | 'all' = 'today') => {
    setIsHistoryLoading(true);
    setError(null);
    try {
      const data = await fetchNurseOrientationHistory(period);
      setHistoryItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de charger l'historique de l'orientation.");
    } finally {
      setIsHistoryLoading(false);
    }
  };

  useEffect(() => {
    loadPatients();
    loadHistory(historyPeriod);
    Promise.all([
      apiFetch<any[]>("/users").catch(() => []),
      fetchServices().catch(() => []),
    ]).then(([users, services]) => {
      setPhysicians((users || []).filter((user) => user.primaryRole === "PHYSICIAN"));
      setServicesCatalog(services || []);
    });
  }, []);

  useEffect(() => {
    loadHistory(historyPeriod);
  }, [historyPeriod]);

  const services = useMemo(
    () => ["Tous", ...Array.from(new Set(patients.map((patient) => patient.service || "Non affecte")))],
    [patients],
  );

  const counts = useMemo(() => {
    const urgent = patients.filter(isUrgentPatient).length;
    const waiting = patients.filter((patient) => patient.workflowStatus === "EN_ATTENTE_INFIRMERIE").length;
    return {
      total: patients.length,
      urgent,
      waiting,
      normal: patients.length - urgent,
    };
  }, [patients]);

  const filteredPatients = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return patients
      .filter((patient) => {
        const name = formatPatientName(patient).toLowerCase();
        const service = (patient.service || "Non affecte").toLowerCase();
        const phone = (patient.phone || "").toLowerCase();
        const matchesSearch = !query || name.includes(query) || service.includes(query) || phone.includes(query);
        const matchesService = serviceFilter === "Tous" || (patient.service || "Non affecte") === serviceFilter;
        return matchesSearch && matchesService;
      })
      .sort((a, b) => {
        const urgentDiff = Number(isUrgentPatient(b)) - Number(isUrgentPatient(a));
        if (urgentDiff !== 0) return urgentDiff;
        return new Date(a.arrivalAt || a.createdAt).getTime() - new Date(b.arrivalAt || b.createdAt).getTime();
      });
  }, [patients, searchQuery, serviceFilter]);

  const openVitalsModal = (patient: NursePatient) => {
    // Trigger audio announcement when opening vitals modal
    try {
      announcePatient(patient, currentUser).catch(() => {});
    } catch {}

    setSelectedPatient(patient);
    setVitalsForm({
      temperature: patient.vitals.temperature || "",
      bloodPressure: patient.vitals.bloodPressure || "",
      spo2: patient.vitals.spo2 || "",
      heartRate: patient.vitals.heartRate || "",
      respiratoryRate: patient.vitals.respiratoryRate || "",
      weight: patient.vitals.weight || "",
      height: patient.vitals.height || "",
      chestCircumference: patient.vitals.chestCircumference || "",
      armCircumference: patient.vitals.armCircumference || "",
      notes: "",
      physicianId: "",
    });
  };

  // Announce patient and play a short tone through speakers
  const announcePatient = async (patient: NursePatient, currentUser: any) => {
    try {
      const nurseName = currentUser ? `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim() : "l'infirmier";
      const serviceName = (currentUser?.serviceResponsabilites && currentUser.serviceResponsabilites[0]?.service?.name) || patient.service || 'votre service';
      const roomText = serviceName ? `dans la salle du service ${serviceName}` : 'dans la salle attribuée au service';

      const text = `Patient ${patient.firstName || ''} ${patient.lastName || ''}, vous êtes attendu par ${nurseName} ${roomText}.`;

      try {
        playNotificationSound();
      } catch (e) {
        // ignore audio errors
      }

      if ('speechSynthesis' in window) {
        const speakWithVoice = (voices: SpeechSynthesisVoice[]) => {
          const frenchVoice = voices.find(
            (voice) =>
              voice.lang?.toLowerCase().startsWith('fr') ||
              voice.name?.toLowerCase().includes('french') ||
              voice.name?.toLowerCase().includes('français') ||
              voice.name?.toLowerCase().includes('francais'),
          );
          const utter = new SpeechSynthesisUtterance(text);
          utter.lang = 'fr-FR';
          if (frenchVoice) {
            utter.voice = frenchVoice;
          }
          utter.rate = 0.95;
          utter.pitch = 1.05;
          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(utter);
        };

        const voices = window.speechSynthesis.getVoices() || [];
        if (voices.length > 0) {
          speakWithVoice(voices);
        } else {
          window.speechSynthesis.onvoiceschanged = () => {
            speakWithVoice(window.speechSynthesis.getVoices() || []);
          };
        }
      }
    } catch (e) {
      // ignore
    }
  };

  const updateVitalsField = (field: keyof VitalsForm, value: string) => {
    setVitalsForm((current) => ({ ...current, [field]: value }));
  };

  const saveVitals = async () => {
    if (!selectedPatient) return;
    if (!vitalsForm.physicianId) {
      setError("Veuillez choisir le medecin a qui envoyer le patient.");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await recordPatientVitalSigns(selectedPatient.id, vitalsForm);
      setSelectedPatient(null);
      setVitalsForm(emptyVitalsForm);
      await Promise.all([loadPatients(), loadHistory(historyPeriod)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible d'enregistrer les signes vitaux.");
    } finally {
      setIsSaving(false);
    }
  };

  const contactDoctor = (patient: NursePatient) => {
    const patientInfo = `Patient: ${formatPatientName(patient)}\nService: ${patient.service || "Non affecte"}\nStatut: ${patient.workflowStatus}\nPriorite: ${patient.priority || "Normale"}`;
    navigate("/nurse/messages", { state: { patientInfo, patientId: patient.id } });
  };

  const servicePhysicianIds = useMemo(() => {
    if (!selectedPatient?.serviceId) return new Set<string>();
    const service = servicesCatalog.find((item) => item.id === selectedPatient.serviceId);
    return new Set((service?.responsables || []).map((responsable: any) => responsable.user?.id).filter(Boolean));
  }, [selectedPatient?.serviceId, servicesCatalog]);

  const sortedPhysicians = useMemo(() => {
    return [...physicians].sort((a, b) => {
      const aInService = servicePhysicianIds.has(a.id) ? 0 : 1;
      const bInService = servicePhysicianIds.has(b.id) ? 0 : 1;
      if (aInService !== bInService) return aInService - bInService;
      return (a.displayName || a.username || "").localeCompare(b.displayName || b.username || "");
    });
  }, [physicians, servicePhysicianIds]);

  return (
    <div className="min-h-screen bg-slate-50 p-4 dark:bg-slate-950 sm:p-6">
      <PageMeta
        title="Patients infirmier | D7 Clinique"
        description="File infirmier alimentee uniquement par les patients PostgreSQL en attente de signes vitaux."
      />
      <PageBreadcrumb pageTitle="Patients a prelever" />

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
              Source: base PostgreSQL
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">
              File infirmier pour signes vitaux
            </h1>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Affiche uniquement les patients en `EN_ATTENTE_INFIRMERIE` ou marques urgents en base.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
              <p className="text-sm text-slate-500 dark:text-slate-400">Total</p>
              <p className="mt-2 text-3xl font-semibold text-slate-900 dark:text-white">{counts.total}</p>
            </div>
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-700 dark:bg-red-900/10">
              <p className="text-sm font-semibold text-red-700 dark:text-red-300">Urgents</p>
              <p className="mt-2 text-3xl font-semibold text-red-700 dark:text-red-300">{counts.urgent}</p>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-900/10">
              <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">En attente</p>
              <p className="mt-2 text-3xl font-semibold text-amber-700 dark:text-amber-300">{counts.waiting}</p>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-700 dark:bg-emerald-900/10">
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Non urgents</p>
              <p className="mt-2 text-3xl font-semibold text-emerald-700 dark:text-emerald-300">{counts.normal}</p>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-[1fr_240px_auto]">
          <label className="block">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Recherche</span>
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Nom, telephone, service"
              className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Service</span>
            <select
              value={serviceFilter}
              onChange={(event) => setServiceFilter(event.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            >
              {services.map((service) => (
                <option key={service} value={service}>
                  {service}
                </option>
              ))}
            </select>
          </label>

          <button
            onClick={loadPatients}
            disabled={isLoading}
            className="self-end rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-700"
          >
            {isLoading ? "Chargement" : "Actualiser"}
          </button>
        </div>
      </section>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 dark:border-red-800 dark:bg-red-900/10 dark:text-red-300">
          {error}
        </div>
      )}

      <section className="mt-6 space-y-4">
        {isLoading ? (
          <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
            Chargement des patients depuis la base...
          </div>
        ) : filteredPatients.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
            Aucun patient ne correspond actuellement a la file infirmier.
          </div>
        ) : (
          filteredPatients.map((patient) => {
            const urgent = isUrgentPatient(patient);
            const name = formatPatientName(patient);
            const initials = [patient.firstName?.[0], patient.lastName?.[0]].filter(Boolean).join("").toUpperCase();

            return (
              <article
                key={patient.id}
                className={`rounded-lg border p-5 shadow-sm ${
                  urgent
                    ? "border-red-300 bg-red-50/70 dark:border-red-800 dark:bg-red-900/10"
                    : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
                }`}
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex gap-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-lg font-bold text-slate-900 dark:bg-slate-800 dark:text-white">
                      {initials}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{name}</h2>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            urgent ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {urgent ? "Urgent" : patient.workflowStatus}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        {patient.gender || "Sexe inconnu"} - {patient.service || "Service non affecte"} - {patient.phone || "Telephone non renseigne"}
                      </p>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        Arrivee: {formatDateTime(patient.arrivalAt || patient.createdAt)}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => openVitalsModal(patient)}
                      className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white dark:bg-slate-700"
                    >
                      Prelever signes vitaux
                    </button>
                    <button
                      onClick={() => setDetailsPatient(patient)}
                      className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    >
                      Dossier
                    </button>
                    <button
                      onClick={() => contactDoctor(patient)}
                      className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 dark:border-sky-800 dark:bg-sky-900/10 dark:text-sky-300"
                    >
                      Contacter medecin
                    </button>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  <VitalCard label="Temperature" value={patient.vitals.temperature} />
                  <VitalCard label="Tension" value={patient.vitals.bloodPressure} />
                  <VitalCard label="SpO2" value={patient.vitals.spo2} />
                  <VitalCard label="Frequence cardiaque" value={patient.vitals.heartRate} />
                  <VitalCard label="Frequence respiratoire" value={patient.vitals.respiratoryRate} />
                  <VitalCard label="Poids" value={patient.vitals.weight} />
                  <VitalCard label="Taille" value={patient.vitals.height} />
                  <VitalCard label="Perimetre thoracique" value={patient.vitals.chestCircumference} />
                  <VitalCard label="Perimetre brachial" value={patient.vitals.armCircumference} />
                </div>
              </article>
            );
          })
        )}
      </section>

      <section className="mt-8 rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Historique du jour</p>
            <h2 className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">Bon de rendu - orientation infirmière</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Affiche les orientations prises aujourd’hui. Les patients orientés quittent la file infirmier.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {(['today', 'yesterday', 'week', 'all'] as const).map((period) => (
              <button
                key={period}
                type="button"
                onClick={() => setHistoryPeriod(period)}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${historyPeriod === period ? 'bg-slate-900 text-white dark:bg-slate-700' : 'border border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-white'}`}
              >
                {period === 'today' ? "Aujourd'hui" : period === 'yesterday' ? 'Hier' : period === 'week' ? '7 derniers jours' : 'Tous'}
              </button>
            ))}
          </div>
        </div>

        {isHistoryLoading ? (
          <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-6 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
            Chargement de l'historique d'orientation...
          </div>
        ) : historyItems.length === 0 ? (
          <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-6 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
            Aucune orientation infirmière n'a été enregistrée pour cette période.
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {historyItems.map((item) => (
              <article key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{item.patientName || 'Patient inconnu'}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Service : {item.service || 'Non affecté'}</p>
                  </div>
                  <div className="text-right text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {formatDateTime(item.eventDate)}
                  </div>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg bg-white p-3 text-sm text-slate-700 dark:bg-slate-900 dark:text-slate-200">
                    <p className="font-semibold text-slate-900 dark:text-white">Infirmier</p>
                    <p>{item.nurseName || 'Non renseigné'}</p>
                  </div>
                  <div className="rounded-lg bg-white p-3 text-sm text-slate-700 dark:bg-slate-900 dark:text-slate-200">
                    <p className="font-semibold text-slate-900 dark:text-white">Médecin orienté</p>
                    <p>{item.physicianName || 'Non renseigné'}</p>
                  </div>
                </div>
                {item.notes && (
                  <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Notes : {item.notes}</p>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      {detailsPatient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-6">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-2xl dark:bg-slate-900">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Dossier patient</p>
                <h3 className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">{formatPatientName(detailsPatient)}</h3>
              </div>
              <button
                onClick={() => setDetailsPatient(null)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:text-slate-200"
              >
                Fermer
              </button>
            </div>
            <div className="mt-5 space-y-3 text-sm text-slate-700 dark:text-slate-200">
              <p>Date de naissance: <span className="font-semibold">{formatDate(detailsPatient.dateOfBirth)}</span></p>
              <p>Sexe: <span className="font-semibold">{detailsPatient.gender || "Non specifie"}</span></p>
              <p>Telephone: <span className="font-semibold">{detailsPatient.phone || "Non renseigne"}</span></p>
              <p>Email: <span className="font-semibold">{detailsPatient.email || "Non renseigne"}</span></p>
              <p>Service: <span className="font-semibold">{detailsPatient.service || "Non affecte"}</span></p>
              <p>Priorite: <span className="font-semibold">{detailsPatient.priority || "Normale"}</span></p>
              <p>Derniere prise: <span className="font-semibold">{formatDateTime(detailsPatient.lastVitalRecordedAt)}</span></p>
            </div>
          </div>
        </div>
      )}

      {selectedPatient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-6">
          <div className="w-full max-w-xl rounded-lg bg-white p-6 shadow-2xl dark:bg-slate-900">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Prise des constantes</p>
                <h3 className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">{formatPatientName(selectedPatient)}</h3>
              </div>
              <button
                onClick={() => setSelectedPatient(null)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:text-slate-200"
              >
                Fermer
              </button>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <VitalInput label="Temperature (C)" value={vitalsForm.temperature} onChange={(value) => updateVitalsField("temperature", value)} />
              <VitalInput label="Tension arterielle" value={vitalsForm.bloodPressure} onChange={(value) => updateVitalsField("bloodPressure", value)} />
              <VitalInput label="SpO2 (%)" value={vitalsForm.spo2} onChange={(value) => updateVitalsField("spo2", value)} />
              <VitalInput label="Frequence cardiaque (bpm)" value={vitalsForm.heartRate} onChange={(value) => updateVitalsField("heartRate", value)} />
              <VitalInput label="Frequence respiratoire (/min)" value={vitalsForm.respiratoryRate} onChange={(value) => updateVitalsField("respiratoryRate", value)} />
              <VitalInput label="Poids (kg)" value={vitalsForm.weight} onChange={(value) => updateVitalsField("weight", value)} />
              <VitalInput label="Taille (cm)" value={vitalsForm.height} onChange={(value) => updateVitalsField("height", value)} />
              <VitalInput label="Perimetre thoracique (cm)" value={vitalsForm.chestCircumference} onChange={(value) => updateVitalsField("chestCircumference", value)} />
              <VitalInput label="Perimetre brachial (cm)" value={vitalsForm.armCircumference} onChange={(value) => updateVitalsField("armCircumference", value)} />
              <label className="block sm:col-span-2">
                <span className="text-sm font-semibold text-slate-900 dark:text-white">Medecin destinataire</span>
                <select
                  value={vitalsForm.physicianId || ""}
                  onChange={(event) => updateVitalsField("physicianId", event.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                >
                  <option value="">Choisir un medecin</option>
                  {sortedPhysicians.map((doctor) => (
                    <option key={doctor.id} value={doctor.id}>
                      {doctor.displayName || `${doctor.firstName || ""} ${doctor.lastName || ""}`.trim() || doctor.username}
                      {servicePhysicianIds.has(doctor.id) ? " - service du patient" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block sm:col-span-2">
                <span className="text-sm font-semibold text-slate-900 dark:text-white">Notes</span>
                <textarea
                  value={vitalsForm.notes}
                  onChange={(event) => updateVitalsField("notes", event.target.value)}
                  rows={3}
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </label>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={saveVitals}
                disabled={isSaving}
                className="flex-1 rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-700"
              >
                {isSaving ? "Enregistrement" : "Enregistrer en base"}
              </button>
              <button
                onClick={() => setSelectedPatient(null)}
                className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function VitalCard({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-2 text-base font-semibold text-slate-900 dark:text-white">{value || "A prelever"}</p>
    </div>
  );
}

function VitalInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-900 dark:text-white">{label}</span>
      <input
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
      />
    </label>
  );
}
