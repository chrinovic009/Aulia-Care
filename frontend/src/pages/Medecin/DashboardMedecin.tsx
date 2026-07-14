import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { AlertTriangle, Mic, MicOff, PhoneCall, Sparkles } from "lucide-react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { Modal } from "../../components/ui/modal";
import { useModal } from "../../hooks/useModal";
import {
  DoctorPatient,
  fetchDoctorAssignedPatients,
  formatDoctorPatientName,
  saveClinicalSections,
} from "../../api/doctor";
import { apiFetch, ApiError } from "../../config/api";
import { useAuth } from "../../context/AuthContext";
import { callPatientToWaitingRoom } from "../../utils/patientCall";

const formatDateTime = (value?: string | null) => {
  if (!value) return "-";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
};

const latestVital = (patient: DoctorPatient, type: string) =>
  patient.vitalSigns?.find((vital) => vital.type === type)?.value || "-";

const serviceName = (patient: DoctorPatient) =>
  typeof patient.service === "string" ? patient.service : patient.service?.name || "";

const summarizeClinicalSummary = (value?: string | null, fallback?: string | null) => {
  if (!value) return fallback || "Aucune note clinique.";
  try {
    const parsed = JSON.parse(value);
    const lines = [
      parsed.medicalHistory?.knownDiseases ? `Antecedents: ${parsed.medicalHistory.knownDiseases}` : "",
      parsed.currentSymptoms?.associatedSymptoms ? `Symptomes: ${parsed.currentSymptoms.associatedSymptoms}` : "",
      parsed.clinicalExam?.generalState ? `Etat general: ${parsed.clinicalExam.generalState}` : "",
      parsed.diagnosis?.principal ? `Diagnostic: ${parsed.diagnosis.principal}` : "",
      parsed.treatmentPlan?.notes ? `Traitement: ${parsed.treatmentPlan.notes}` : "",
      parsed.followUp?.notes ? `Suivi: ${parsed.followUp.notes}` : "",
    ].filter(Boolean);
    return lines.length ? lines.join(" | ") : fallback || "Aucune note clinique.";
  } catch {
    return value || fallback || "Aucune note clinique.";
  }
};

declare global {
  interface Window {
    SpeechRecognition?: any;
    webkitSpeechRecognition?: any;
  }
}

const normalizeVoiceText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const appendClinicalValue = (current: string, addition?: string) => {
  const cleanAddition = String(addition || "").trim();
  if (!cleanAddition) return current;
  const parts = current.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.some((part) => normalizeVoiceText(part) === normalizeVoiceText(cleanAddition))) return current;
  return [...parts, cleanAddition].join(", ");
};

const extractClinicalVoiceFields = (transcript: string) => {
  const text = normalizeVoiceText(transcript);
  const extracted: Partial<{
    chiefComplaint: string;
    onset: string;
    painLocation: string;
    intensity: string;
    associatedSymptoms: string;
    aggravatingFactors: string;
  }> = {};

  const onsetMatch = text.match(/depuis\s+([^.,;!?]+)/);
  if (onsetMatch?.[1]) {
    extracted.onset = onsetMatch[1].trim();
  }

  const painLocations: string[] = [];
  if (text.includes("au-dessus de l'estomac") || text.includes("au dessus de l'estomac") || text.includes("epigastr") || text.includes("estomac")) {
    painLocations.push("Zone epigastrique");
  }
  if (text.includes("dos")) {
    painLocations.push("Irradiation dorsale");
  }
  if (text.includes("ventre") || text.includes("abdom")) {
    painLocations.push("Region abdominale");
  }
  if (painLocations.length) {
    extracted.painLocation = painLocations.join(", ");
  }

  if (text.includes("tres douloureux") || text.includes("tres douloureuse") || text.includes("forte douleur") || text.includes("insupportable")) {
    extracted.intensity = "7-10";
  } else if (text.includes("modere") || text.includes("supportable")) {
    extracted.intensity = "4-6";
  } else if (text.includes("leger") || text.includes("faible")) {
    extracted.intensity = "1-3";
  }

  const symptoms: string[] = [];
  if (text.includes("barre") && text.includes("doul")) symptoms.push("Douleur en barre");
  if (text.includes("lance dans le dos") || text.includes("dos")) symptoms.push("Irradiation vers le dos");
  if (text.includes("nausee")) symptoms.push("Nausees");
  if (text.includes("vom")) symptoms.push("Vomissements");
  if (text.includes("fievre")) symptoms.push("Fievre");
  if (text.includes("fatigue")) symptoms.push("Fatigue");
  if (symptoms.length) {
    extracted.associatedSymptoms = symptoms.join(", ");
  }

  if (text.includes("soulage") || text.includes("aggrave")) {
    extracted.aggravatingFactors = transcript.trim();
  }

  if (extracted.painLocation || extracted.associatedSymptoms) {
    extracted.chiefComplaint = extracted.painLocation?.includes("epigastrique")
      ? "Douleur epigastrique"
      : "Douleur ou symptomes rapportes par le patient";
  }

  return extracted;
};

export default function DashboardMedecin() {
  const location = useLocation();
  const { currentUser } = useAuth();
  const isConsultationPage = location.pathname.includes("/doctor/consultations");
  const [patients, setPatients] = useState<DoctorPatient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<DoctorPatient | null>(null);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [stock, setStock] = useState<any>({});
  const [medicationForm, setMedicationForm] = useState({ code: "", name: "", unit: "", strength: "", manufacturer: "" });
  const [lotForm, setLotForm] = useState({ medicationId: "", batchNumber: "", quantity: "", purchasePrice: "", expiryDate: "" });
  const [conflictMedication, setConflictMedication] = useState<any | null>(null);
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  const { isOpen: isConflictOpen, openModal: openConflictModal, closeModal: closeConflictModal } = useModal(false);
  const lotPanelRef = useRef<HTMLDivElement | null>(null);
  const speechRecognitionRef = useRef<any>(null);
  const speechFinalTextRef = useRef("");
  const speechVisibleTextRef = useRef("");
  const speechSilenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isVoiceListening, setIsVoiceListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceMessage, setVoiceMessage] = useState<string | null>(null);
  const [clinicalForm, setClinicalForm] = useState({
    chiefComplaint: "",
    knownDiseases: "",
    surgeries: "",
    allergies: "",
    currentMedications: "",
    familyHistory: "",
    onset: "",
    painLocation: "",
    intensity: "",
    aggravatingFactors: "",
    associatedSymptoms: "",
    generalState: "",
    auscultation: "",
    palpation: "",
    focusedExam: "",
    principalDiagnosis: "",
    hypotheses: "",
    treatmentPlan: "",
    followUp: "",
  });
  const loadPatients = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchDoctorAssignedPatients();
      const ordered = [...data].sort((a, b) => {
        const aDate = a.latestConsultation?.createdAt || a.consultations?.[0]?.createdAt || "";
        const bDate = b.latestConsultation?.createdAt || b.consultations?.[0]?.createdAt || "";
        return new Date(aDate).getTime() - new Date(bDate).getTime();
      });
      setPatients(ordered);
      setSelectedPatient((current) => current || ordered[0] || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de charger la file medecin.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPatients();
    const handler = () => loadPatients();
    window.addEventListener("d7:patient.updated", handler);
    window.addEventListener("d7:consultation.created", handler);
    window.addEventListener("d7:clinicalDataUpdated", handler);
    window.addEventListener("d7:lab.request.created", handler);
    window.addEventListener("d7:lab.result.created", handler);
    return () => {
      window.removeEventListener("d7:patient.updated", handler);
      window.removeEventListener("d7:consultation.created", handler);
      window.removeEventListener("d7:clinicalDataUpdated", handler);
      window.removeEventListener("d7:lab.request.created", handler);
      window.removeEventListener("d7:lab.result.created", handler);
    };
  }, []);

  useEffect(() => {
    const consultation = selectedPatient?.latestConsultation || selectedPatient?.consultations?.[0];
    if (!consultation) return;

    let parsed: any = {};
    try {
      parsed = consultation.clinicalSummary ? JSON.parse(consultation.clinicalSummary) : {};
    } catch {
      parsed = {};
    }

    setClinicalForm((current) => ({
      ...current,
      chiefComplaint: consultation.chiefComplaint || current.chiefComplaint,
      knownDiseases: parsed.medicalHistory?.knownDiseases || "",
      surgeries: parsed.medicalHistory?.surgeries || "",
      allergies: parsed.medicalHistory?.allergies || "",
      currentMedications: parsed.medicalHistory?.currentMedications || "",
      familyHistory: parsed.medicalHistory?.familyHistory || "",
      onset: parsed.currentSymptoms?.onset || "",
      painLocation: parsed.currentSymptoms?.painLocation || "",
      intensity: parsed.currentSymptoms?.intensity || "",
      aggravatingFactors: parsed.currentSymptoms?.aggravatingFactors || "",
      associatedSymptoms: parsed.currentSymptoms?.associatedSymptoms || "",
      generalState: parsed.clinicalExam?.generalState || "",
      auscultation: parsed.clinicalExam?.auscultation || "",
      palpation: parsed.clinicalExam?.palpation || "",
      focusedExam: parsed.clinicalExam?.focusedExam || "",
      principalDiagnosis: parsed.diagnosis?.principal || consultation.diagnosis || "",
      hypotheses: Array.isArray(parsed.diagnosis?.hypotheses) ? parsed.diagnosis.hypotheses.join("\n") : "",
      treatmentPlan: parsed.treatmentPlan?.notes || "",
      followUp: parsed.followUp?.notes || "",
    }));
  }, [selectedPatient?.id]);

  const getMedicationStockQuantity = (medicationId: string) => {
    const lotsQuantity = (stock.lots || []).filter((lot: any) => lot.medicationId === medicationId).reduce((sum: number, lot: any) => sum + Number(lot.quantity || 0), 0);
    const stocksQuantity = (stock.stocks || []).filter((item: any) => item.medicationId === medicationId).reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0);
    return lotsQuantity || stocksQuantity || 0;
  };

  const closeConflictModalAndClear = () => {
    closeConflictModal();
    setConflictMedication(null);
    setConflictMessage(null);
  };

  const consultExistingMedication = () => {
    if (conflictMedication?.id) {
      setLotForm((current) => ({ ...current, medicationId: conflictMedication.id }));
      setTimeout(() => lotPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
      setActionMessage("Le médicament a été trouvé et sélectionné dans le formulaire de lot.");
    }
    closeConflictModalAndClear();
  };

  const openMedicationInLotForm = () => {
    if (conflictMedication?.id) {
      setLotForm((current) => ({ ...current, medicationId: conflictMedication.id }));
      setTimeout(() => lotPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
      setActionMessage("Vous pouvez ajouter de nouvelles quantités dans le formulaire de lot ci-dessous.");
    }
    closeConflictModalAndClear();
  };

  const createMedication = async () => {
    if (!medicationForm.code || !medicationForm.name || !medicationForm.unit) {
      setActionMessage('Le code, le nom et l\'unité sont requis pour ajouter un médicament.');
      return;
    }

    try {
      await apiFetch("/administration/stock/medications", { method: "POST", body: JSON.stringify(medicationForm) });
      setMedicationForm({ code: "", name: "", unit: "", strength: "", manufacturer: "" });
      const refreshedStock = await apiFetch("/administration/stock").catch(() => ({}));
      setStock(refreshedStock);
      setActionMessage('Médicament ajouté au catalogue.');
    } catch (error: any) {
      if (error instanceof ApiError && error.status === 409) {
        const body = error.body || {};
        setConflictMedication(body.medication || null);
        setConflictMessage(
          typeof body.message === "string"
            ? body.message
            : "Ce médicament existe déjà dans le stock. Il n'est pas nécessaire de le recréer. Vous pouvez le retrouver dans la liste des médicaments ou mettre à jour sa quantité."
        );
        openConflictModal();
        return;
      }

      setActionMessage(error instanceof Error ? error.message : 'Impossible d\'ajouter le médicament.');
    }
  };

  const createLot = async () => {
    if (!lotForm.medicationId || !lotForm.batchNumber) {
      setActionMessage('Le médicament et le numéro de lot sont requis.');
      return;
    }

    try {
      await apiFetch("/administration/stock/lots", { method: "POST", body: JSON.stringify(lotForm) });
      setLotForm({ medicationId: "", batchNumber: "", quantity: "", purchasePrice: "", expiryDate: "" });
      const refreshedStock = await apiFetch("/administration/stock").catch(() => ({}));
      setStock(refreshedStock);
      setActionMessage('Lot ajouté avec succès.');
    } catch (error: any) {
      setActionMessage(error instanceof Error ? error.message : 'Impossible d\'ajouter le lot.');
    }
  };

  const currentConsultationId = selectedPatient?.latestConsultation?.id || selectedPatient?.consultations?.[0]?.id || "";

  const submitClinicalSections = async () => {
    if (!currentConsultationId) {
      setActionMessage("Aucune consultation active pour ce patient.");
      return;
    }
    setActionMessage(null);
    await saveClinicalSections(currentConsultationId, {
      chiefComplaint: clinicalForm.chiefComplaint,
      medicalHistory: {
        knownDiseases: clinicalForm.knownDiseases,
        surgeries: clinicalForm.surgeries,
        allergies: clinicalForm.allergies,
        currentMedications: clinicalForm.currentMedications,
        familyHistory: clinicalForm.familyHistory,
      },
      currentSymptoms: {
        onset: clinicalForm.onset,
        painLocation: clinicalForm.painLocation,
        intensity: clinicalForm.intensity,
        aggravatingFactors: clinicalForm.aggravatingFactors,
        associatedSymptoms: clinicalForm.associatedSymptoms,
      },
      clinicalExam: {
        generalState: clinicalForm.generalState,
        auscultation: clinicalForm.auscultation,
        palpation: clinicalForm.palpation,
        focusedExam: clinicalForm.focusedExam,
      },
      diagnosis: {
        principal: clinicalForm.principalDiagnosis,
        hypotheses: clinicalForm.hypotheses.split("\n").map((item) => item.trim()).filter(Boolean),
      },
      treatmentPlan: { notes: clinicalForm.treatmentPlan },
      followUp: { notes: clinicalForm.followUp },
    });
    setActionMessage("Dossier clinique sauvegarde.");
    await loadPatients();
  };

  const applyVoiceTranscriptToForm = (transcript: string) => {
    const cleanTranscript = transcript.trim();
    if (!cleanTranscript) return;
    const extracted = extractClinicalVoiceFields(cleanTranscript);

    setClinicalForm((current) => ({
      ...current,
      chiefComplaint: extracted.chiefComplaint || current.chiefComplaint,
      onset: extracted.onset || current.onset,
      painLocation: appendClinicalValue(current.painLocation, extracted.painLocation),
      intensity: extracted.intensity || current.intensity,
      associatedSymptoms: appendClinicalValue(current.associatedSymptoms, extracted.associatedSymptoms),
      aggravatingFactors: extracted.aggravatingFactors || current.aggravatingFactors,
    }));

    const filledFields = Object.values(extracted).filter(Boolean).length;
    setVoiceMessage(
      filledFields
        ? `Assistance vocale: ${filledFields} champ(s) pre-rempli(s). Verifiez puis sauvegardez.`
        : "Assistance vocale: transcription capturee, mais aucun champ clinique fiable n'a ete detecte.",
    );
  };

  const stopVoiceAssistant = (reason: "manual" | "silence" = "manual") => {
    if (speechSilenceTimerRef.current) {
      clearTimeout(speechSilenceTimerRef.current);
      speechSilenceTimerRef.current = null;
    }
    const recognition = speechRecognitionRef.current;
    speechRecognitionRef.current = null;
    setIsVoiceListening(false);
    try {
      recognition?.stop?.();
    } catch {
      // Browser recognition can already be stopped.
    }

    const transcript = speechVisibleTextRef.current || speechFinalTextRef.current || voiceTranscript;
    applyVoiceTranscriptToForm(transcript);
    if (reason === "silence") {
      setVoiceMessage((current) => current || "Ecoute arretee apres silence prolonge.");
    }
  };

  const scheduleVoiceSilenceStop = () => {
    if (speechSilenceTimerRef.current) clearTimeout(speechSilenceTimerRef.current);
    speechSilenceTimerRef.current = setTimeout(() => stopVoiceAssistant("silence"), 9000);
  };

  const startVoiceAssistant = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceMessage("Assistance vocale indisponible: utilisez Chrome ou Edge avec un microphone autorise.");
      return;
    }

    speechFinalTextRef.current = "";
    speechVisibleTextRef.current = "";
    setVoiceTranscript("");
    setVoiceMessage("Ecoute active: posez vos questions, puis laissez le patient repondre.");

    const recognition = new SpeechRecognition();
    recognition.lang = "fr-FR";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event: any) => {
      let interim = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const text = result?.[0]?.transcript || "";
        if (result.isFinal) {
          speechFinalTextRef.current = `${speechFinalTextRef.current} ${text}`.trim();
        } else {
          interim = `${interim} ${text}`.trim();
        }
      }
      const visibleTranscript = `${speechFinalTextRef.current} ${interim}`.trim();
      speechVisibleTextRef.current = visibleTranscript;
      setVoiceTranscript(visibleTranscript);
      scheduleVoiceSilenceStop();
    };

    recognition.onerror = () => {
      setVoiceMessage("Le microphone n'a pas pu etre utilise. Verifiez l'autorisation du navigateur.");
      setIsVoiceListening(false);
    };

    recognition.onend = () => {
      if (speechRecognitionRef.current === recognition) {
        setIsVoiceListening(false);
        speechRecognitionRef.current = null;
      }
    };

    speechRecognitionRef.current = recognition;
    setIsVoiceListening(true);
    recognition.start();
    scheduleVoiceSilenceStop();
  };

  const toggleVoiceAssistant = () => {
    if (isVoiceListening) {
      stopVoiceAssistant("manual");
      return;
    }
    startVoiceAssistant();
  };

  const callSelectedPatient = () => {
    if (!selectedPatient) return;
    const doctorName = currentUser?.displayName || [currentUser?.firstName, currentUser?.lastName].filter(Boolean).join(" ") || "le medecin";
    const destination = `la consultation ${serviceName(selectedPatient) || "medicale"}`;
    const message = callPatientToWaitingRoom({
      patientName: formatDoctorPatientName(selectedPatient),
      destination,
      staffName: doctorName,
    });
    setActionMessage(`Appel diffuse: ${message}`);
  };

  useEffect(() => () => {
    if (speechSilenceTimerRef.current) clearTimeout(speechSilenceTimerRef.current);
    try {
      speechRecognitionRef.current?.stop?.();
    } catch {
      // Ignore cleanup errors.
    }
  }, []);

  const filteredPatients = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return patients;
    return patients.filter((patient) =>
      [formatDoctorPatientName(patient), serviceName(patient), patient.phone, patient.priority]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [patients, query]);

  const metrics = useMemo(() => {
    const openConsultations = patients.filter((patient) =>
      patient.consultations?.some((consultation) => consultation.status !== "COMPLETED"),
    ).length;
    const urgent = patients.filter((patient) =>
      ["urgent", "urgence", "prioritaire", "critical", "critique"].includes((patient.priority || "").toLowerCase()),
    ).length;
    return {
      patients: patients.length,
      openConsultations,
      urgent,
      prescriptions: patients.reduce((sum, patient) => sum + (patient.prescriptions?.length || 0), 0),
    };
  }, [patients]);

  return (
    <div className="min-h-screen bg-slate-50 p-4 dark:bg-slate-950 sm:p-6">
      <PageMeta title="Dashboard medecin | D7 Clinique" description="File medecin alimentee par PostgreSQL." />
      <PageBreadcrumb pageTitle="Dashboard medecin" />

      <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              File triee en premier arrive, premier servi selon l'orientation vers le medecin.
            </p>
          </div>
          <button onClick={loadPatients} className="rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white">
            Actualiser
          </button>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-4">
          <Metric label="Patients" value={metrics.patients} />
          <Metric label="Consultations ouvertes" value={metrics.openConsultations} tone="blue" />
          <Metric label="Urgents" value={metrics.urgent} tone="red" />
          <Metric label="Prescriptions" value={metrics.prescriptions} tone="green" />
        </div>
      </section>

      {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      {actionMessage && <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-700">{actionMessage}</div>}

      <div className="mt-6 grid gap-6 xl:grid-cols-[360px_1fr]">
        <aside className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher patient, service, priorite..."
            className="mb-4 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          />

          {isLoading ? (
            <p className="text-sm text-slate-500">Chargement...</p>
          ) : filteredPatients.length === 0 ? (
            <p className="text-sm text-slate-500">Aucun patient oriente vers vous.</p>
          ) : (
            <div className="space-y-3">
              {filteredPatients.map((patient) => (
                <button
                  key={patient.id}
                  onClick={() => setSelectedPatient(patient)}
                  className={`w-full rounded-lg border p-3 text-left ${
                    selectedPatient?.id === patient.id
                      ? "border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/40"
                      : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"
                  }`}
                >
                  <p className="font-semibold text-slate-900 dark:text-white">{formatDoctorPatientName(patient)}</p>
                  <p className="mt-1 text-xs text-slate-500">{serviceName(patient) || "Service non renseigne"}</p>
                  <p className="mt-1 text-xs text-slate-500">Priorite: {patient.priority || "Normale"}</p>
                </button>
              ))}
            </div>
          )}
        </aside>

        <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          {!selectedPatient ? (
            <p className="text-sm text-slate-500">Selectionnez un patient.</p>
          ) : (
            <div>
              <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 dark:border-slate-800 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900 dark:text-white">{formatDoctorPatientName(selectedPatient)}</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {selectedPatient.gender || "-"} - {selectedPatient.phone || "Telephone non renseigne"} - {serviceName(selectedPatient) || "Service non renseigne"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={callSelectedPatient}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
                  >
                    <PhoneCall size={16} /> Appeler le patient
                  </button>
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                    {selectedPatient.workflowStatus || "Statut non renseigne"}
                  </span>
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-5">
                <Vital label="Temperature" value={latestVital(selectedPatient, "TEMPERATURE")} />
                <Vital label="Tension" value={latestVital(selectedPatient, "BLOOD_PRESSURE")} />
                <Vital label="SpO2" value={latestVital(selectedPatient, "OXYGEN_SATURATION")} />
                <Vital label="Pouls" value={latestVital(selectedPatient, "HEART_RATE")} />
                <Vital label="Respiration" value={latestVital(selectedPatient, "RESPIRATORY_RATE")} />
                <Vital label="Poids" value={latestVital(selectedPatient, "WEIGHT")} />
                <Vital label="Taille" value={latestVital(selectedPatient, "HEIGHT")} />
                <Vital label="P. thoracique" value={latestVital(selectedPatient, "CHEST_CIRCUMFERENCE")} />
                <Vital label="P. brachial" value={latestVital(selectedPatient, "ARM_CIRCUMFERENCE")} />
              </div>

              {isConsultationPage ? (
              <div className="mt-6">
                <Panel title="Consultation medicale">
                  <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 dark:border-blue-900/60 dark:bg-blue-950/30">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="flex items-center gap-2 text-sm font-semibold text-blue-900 dark:text-blue-100">
                          <Sparkles size={16} /> Assistance vocale clinique
                        </p>
                        <p className="mt-1 text-xs leading-5 text-blue-700 dark:text-blue-200">
                          Capture l'echange medecin-patient, transcrit localement via le navigateur et pre-remplit les champs detectes.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={toggleVoiceAssistant}
                        className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                          isVoiceListening
                            ? "bg-red-600 text-white hover:bg-red-700"
                            : "bg-blue-600 text-white hover:bg-blue-700"
                        }`}
                      >
                        {isVoiceListening ? <MicOff size={16} /> : <Mic size={16} />}
                        {isVoiceListening ? "Desactiver" : "Activer l'assistance vocale"}
                      </button>
                    </div>
                    {voiceMessage && <p className="mt-3 text-xs font-medium text-blue-800 dark:text-blue-100">{voiceMessage}</p>}
                    {voiceTranscript && (
                      <div className="mt-3 max-h-28 overflow-y-auto rounded-lg border border-blue-100 bg-white p-3 text-xs leading-5 text-slate-700 dark:border-blue-900/60 dark:bg-slate-950 dark:text-slate-200">
                        {voiceTranscript}
                      </div>
                    )}
                  </div>

                  <FormInput label="Motif de consultation" value={clinicalForm.chiefComplaint} onChange={(value) => setClinicalForm((current) => ({ ...current, chiefComplaint: value }))} />

                  <SectionBox title="Antecedents medicaux">
                    <div className="grid gap-3 md:grid-cols-2">
                      <SuggestionInput label="Maladies connues" value={clinicalForm.knownDiseases} onChange={(value) => setClinicalForm((current) => ({ ...current, knownDiseases: value }))} suggestions={["Diabete", "Hypertension", "Asthme", "Drepanocytose", "VIH", "Tuberculose"]} />
                      <FormTextArea label="Chirurgies anterieures" value={clinicalForm.surgeries} onChange={(value) => setClinicalForm((current) => ({ ...current, surgeries: value }))} />
                      <SuggestionInput label="Allergies" value={clinicalForm.allergies} onChange={(value) => setClinicalForm((current) => ({ ...current, allergies: value }))} suggestions={["Penicilline", "AINS", "Latex", "Iode", "Aucune allergie connue"]} />
                      <FormTextArea label="Medicaments pris actuellement" value={clinicalForm.currentMedications} onChange={(value) => setClinicalForm((current) => ({ ...current, currentMedications: value }))} />
                      <FormTextArea label="Antecedents familiaux importants" value={clinicalForm.familyHistory} onChange={(value) => setClinicalForm((current) => ({ ...current, familyHistory: value }))} />
                    </div>
                  </SectionBox>

                  <SectionBox title="Symptomes actuels">
                    <div className="grid gap-3 md:grid-cols-2">
                      <FormInput label="Depuis quand ?" value={clinicalForm.onset} onChange={(value) => setClinicalForm((current) => ({ ...current, onset: value }))} placeholder="Ex: 3 jours" />
                      <FormInput label="Ou est la douleur ?" value={clinicalForm.painLocation} onChange={(value) => setClinicalForm((current) => ({ ...current, painLocation: value }))} />
                      <FormSelect label="Intensite" value={clinicalForm.intensity} onChange={(value) => setClinicalForm((current) => ({ ...current, intensity: value }))} options={[["", "Non precisee"], ["1-3", "Faible 1-3"], ["4-6", "Moderee 4-6"], ["7-10", "Severe 7-10"]]} />
                      <FormTextArea label="Facteurs aggravants ou soulageants" value={clinicalForm.aggravatingFactors} onChange={(value) => setClinicalForm((current) => ({ ...current, aggravatingFactors: value }))} />
                      <SuggestionInput label="Symptomes associes" value={clinicalForm.associatedSymptoms} onChange={(value) => setClinicalForm((current) => ({ ...current, associatedSymptoms: value }))} suggestions={["Fievre", "Nausees", "Vomissements", "Fatigue", "Cephalees", "Dyspnee", "Toux"]} />
                    </div>
                  </SectionBox>

                  <SectionBox title="Examen clinique">
                    <div className="grid gap-3 md:grid-cols-2">
                      <FormSelect label="Etat general" value={clinicalForm.generalState} onChange={(value) => setClinicalForm((current) => ({ ...current, generalState: value }))} options={[["", "Non precise"], ["Bon", "Bon"], ["Moyen", "Moyen"], ["Alteré", "Altere"], ["Critique", "Critique"]]} />
                      <FormTextArea label="Resultats de l'auscultation" value={clinicalForm.auscultation} onChange={(value) => setClinicalForm((current) => ({ ...current, auscultation: value }))} />
                      <FormTextArea label="Palpation" value={clinicalForm.palpation} onChange={(value) => setClinicalForm((current) => ({ ...current, palpation: value }))} />
                      <FormTextArea label="Examen des parties concernees" value={clinicalForm.focusedExam} onChange={(value) => setClinicalForm((current) => ({ ...current, focusedExam: value }))} />
                    </div>
                  </SectionBox>

                  <SectionBox title="Diagnostic">
                    <div className="grid gap-3 md:grid-cols-2">
                      <FormInput label="Diagnostic principal" value={clinicalForm.principalDiagnosis} onChange={(value) => setClinicalForm((current) => ({ ...current, principalDiagnosis: value }))} />
                      <FormTextArea label="Diagnostics possibles" value={clinicalForm.hypotheses} onChange={(value) => setClinicalForm((current) => ({ ...current, hypotheses: value }))} placeholder="Une hypothese par ligne" />
                    </div>
                  </SectionBox>

                  <SectionBox title="Traitement et suivi">
                    <div className="grid gap-3 md:grid-cols-2">
                      <FormTextArea label="Conseils au patient / hygiene de vie" value={clinicalForm.treatmentPlan} onChange={(value) => setClinicalForm((current) => ({ ...current, treatmentPlan: value }))} />
                      <FormTextArea label="Plan de suivi" value={clinicalForm.followUp} onChange={(value) => setClinicalForm((current) => ({ ...current, followUp: value }))} />
                    </div>
                  </SectionBox>
                  <button onClick={submitClinicalSections} className="mt-4 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white">
                    Sauvegarder le dossier clinique
                  </button>
                </Panel>
              </div>
              ) : (
                <div className="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
                  Le dossier complet de tous les patients est disponible dans l'onglet Patients. Les formulaires d'ecriture sont dans Consultations.
                </div>
              )}

              <div className="mt-6 grid gap-4 xl:grid-cols-2">
                <Panel title="Consultations">
                  {(selectedPatient.consultations || []).length === 0 ? (
                    <Empty />
                  ) : (
                    selectedPatient.consultations?.map((consultation) => (
                      <Item
                        key={consultation.id}
                        title={consultation.chiefComplaint || consultation.status}
                        subtitle={formatDateTime(consultation.createdAt)}
                        text={summarizeClinicalSummary(consultation.clinicalSummary, consultation.diagnosis)}
                      />
                    ))
                  )}
                </Panel>

                <Panel title="Prescriptions">
                  {(selectedPatient.prescriptions || []).length === 0 ? (
                    <Empty />
                  ) : (
                    selectedPatient.prescriptions?.map((prescription) => (
                      <Item key={prescription.id} title={prescription.status} subtitle={formatDateTime(prescription.prescribingDate)} text={prescription.instruction || prescription.lineItems?.map((line) => [line.dosage, line.frequency, line.notes].filter(Boolean).join(" - ")).join(", ") || "Prescription sans detail."} />
                    ))
                  )}
                </Panel>

                <Panel title="Examens laboratoire">
                  {(selectedPatient.labRequests || []).length === 0 ? (
                    <Empty />
                  ) : (
                    selectedPatient.labRequests?.map((request) => (
                      <Item key={request.id} title={request.specimenType || request.status} subtitle={formatDateTime(request.requestedAt)} text={request.results?.map((result) => `${result.resultName}: ${result.resultValue} ${result.units || ""}`).join(", ") || "Resultat en attente."} />
                    ))
                  )}
                </Panel>

                <Panel title="Imagerie">
                  {(selectedPatient.imagingRequests || []).length === 0 ? (
                    <Empty />
                  ) : (
                    selectedPatient.imagingRequests?.map((request) => (
                      <Item key={request.id} title={`${request.modality} - ${request.bodyPart}`} subtitle={formatDateTime(request.createdAt)} text={request.report?.impression || request.status} />
                    ))
                  )}
                </Panel>
              </div>
            </div>
          )}
        </section>
      </div>

      {false && (
      <>
      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Approvisionnement pharmaceutique</h2>
          <p className="mt-1 text-sm text-slate-500">Reserve au medecin: ajout de medicaments et lots disponibles au stock.</p>
        </div>
        <div className="grid gap-6 xl:grid-cols-2">
          <Panel title="Nouveau medicament">
            <div className="grid gap-3 sm:grid-cols-2">
              <input value={medicationForm.code} onChange={(event) => setMedicationForm((current) => ({ ...current, code: event.target.value }))} placeholder="Code" className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
              <input value={medicationForm.name} onChange={(event) => setMedicationForm((current) => ({ ...current, name: event.target.value }))} placeholder="Nom" className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
              <input value={medicationForm.unit} onChange={(event) => setMedicationForm((current) => ({ ...current, unit: event.target.value }))} placeholder="Unite" className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
              <input value={medicationForm.strength} onChange={(event) => setMedicationForm((current) => ({ ...current, strength: event.target.value }))} placeholder="Dosage" className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
              <input value={medicationForm.manufacturer} onChange={(event) => setMedicationForm((current) => ({ ...current, manufacturer: event.target.value }))} placeholder="Fabricant" className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white sm:col-span-2" />
              <button onClick={createMedication} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white sm:col-span-2">Ajouter au catalogue</button>
            </div>
          </Panel>

          <div ref={lotPanelRef}>
            <Panel title="Nouveau lot">
              <div className="grid gap-3 sm:grid-cols-2">
                <select value={lotForm.medicationId} onChange={(event) => setLotForm((current) => ({ ...current, medicationId: event.target.value }))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white sm:col-span-2">
                  <option value="">Medicament</option>
                  {(stock.medications || []).map((medication: any) => <option key={medication.id} value={medication.id}>{medication.name}</option>)}
                </select>
                <input value={lotForm.batchNumber} onChange={(event) => setLotForm((current) => ({ ...current, batchNumber: event.target.value }))} placeholder="Lot" className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
                <input value={lotForm.quantity} onChange={(event) => setLotForm((current) => ({ ...current, quantity: event.target.value }))} type="number" placeholder="Quantite" className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
                <input value={lotForm.purchasePrice} onChange={(event) => setLotForm((current) => ({ ...current, purchasePrice: event.target.value }))} type="number" placeholder="Prix achat" className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
                <input value={lotForm.expiryDate} onChange={(event) => setLotForm((current) => ({ ...current, expiryDate: event.target.value }))} type="date" className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
                <button onClick={createLot} className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white sm:col-span-2">Ajouter le lot</button>
              </div>
            </Panel>
          </div>
        </div>
      </section>

      <Modal isOpen={isConflictOpen} onClose={closeConflictModalAndClear} className="max-w-xl p-6">
        <div className="flex flex-col gap-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-3xl bg-blue-100 text-blue-700 dark:bg-slate-800 dark:text-blue-300">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-slate-900 dark:text-white">Médicament déjà enregistré</h3>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{conflictMessage || "Ce médicament existe déjà dans le stock. Il n'est pas nécessaire de le recréer. Vous pouvez le retrouver dans la liste des médicaments ou mettre à jour sa quantité."}</p>
            </div>
          </div>

          {conflictMedication ? (
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-slate-500">Nom</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{conflictMedication.name || "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Dosage</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{conflictMedication.strength || "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Forme pharmaceutique</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{conflictMedication.unit || "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Quantité actuelle</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{conflictMedication.currentQuantity ?? getMedicationStockQuantity(conflictMedication.id) ?? "-"}</p>
                </div>
              </div>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-3">
            <button type="button" onClick={consultExistingMedication} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700">
              Consulter le médicament
            </button>
            <button type="button" onClick={openMedicationInLotForm} className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:hover:bg-slate-900">
              Mettre à jour le stock
            </button>
            <button type="button" onClick={closeConflictModalAndClear} className="rounded-lg border border-slate-200 bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
              Fermer
            </button>
          </div>
        </div>
      </Modal>
      </>
      )}
    </div>
  );
}

function Metric({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "blue" | "red" | "green" }) {
  const colors = {
    default: "text-slate-900 dark:text-white",
    blue: "text-blue-700 dark:text-blue-300",
    red: "text-red-700 dark:text-red-300",
    green: "text-emerald-700 dark:text-emerald-300",
  };
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${colors[tone]}`}>{value}</p>
    </div>
  );
}

function Vital({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-2 font-semibold text-slate-900 dark:text-white">{value}</p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
      <h3 className="font-semibold text-slate-900 dark:text-white">{title}</h3>
      <div className="mt-3 space-y-3">{children}</div>
    </div>
  );
}

function Item({ title, subtitle, text }: { title: string; subtitle: string; text: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-950">
      <p className="font-semibold text-slate-900 dark:text-white">{title}</p>
      <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
      <p className="mt-2 text-slate-600 dark:text-slate-300">{text}</p>
    </div>
  );
}

function SectionBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-950/60">
      <h4 className="mb-3 text-sm font-semibold text-slate-800 dark:text-white">{title}</h4>
      {children}
    </div>
  );
}

function SuggestionInput({
  label,
  value,
  onChange,
  suggestions,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
}) {
  const appendSuggestion = (suggestion: string) => {
    const parts = value.split(",").map((part) => part.trim()).filter(Boolean);
    if (parts.map((part) => part.toLowerCase()).includes(suggestion.toLowerCase())) return;
    onChange([...parts, suggestion].join(", "));
  };

  return (
    <div>
      <FormTextArea label={label} value={value} onChange={onChange} />
      <div className="mt-2 flex flex-wrap gap-2">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => appendSuggestion(suggestion)}
            className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-blue-300 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}

function FormInput({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <label className={`block text-sm ${className}`}>
      <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">{label}</span>
      <input
        value={value}
        type={type}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-blue-400 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
      />
    </label>
  );
}

function FormTextArea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">{label}</span>
      <textarea
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-blue-400 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
      />
    </label>
  );
}

function FormSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-blue-400 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
      >
        {options.map(([key, optionLabel]) => <option key={key} value={key}>{optionLabel}</option>)}
      </select>
    </label>
  );
}

function Empty() {
  return <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500 dark:bg-slate-950">Aucune donnee disponible.</p>;
}
