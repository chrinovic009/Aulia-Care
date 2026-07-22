import { useEffect, useMemo, useState, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AlertTriangle, Mic, MicOff, PhoneCall, Sparkles } from "lucide-react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import {
  DoctorPatient,
  fetchDoctorAssignedPatients,
  formatDoctorPatientName,
  saveClinicalSections,
} from "../../api/doctor";
import { apiFetch, ApiError } from "../../config/api";
import { useAuth } from "../../context/AuthContext";
import { callPatientToWaitingRoom } from "../../utils/patientCall";

// Petit hook utilitaire pour gérer l'état d'une modale
function useModal(initialState = false) {
  const [isOpen, setIsOpen] = useState(initialState);
  const openModal = () => setIsOpen(true);
  const closeModal = () => setIsOpen(false);
  return { isOpen, openModal, closeModal };
}

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

type VoiceRoute = "chiefComplaint" | "onsetDuration" | "hpiDescription" | "knownDiseases" | "lifestyle";

const voiceRouteLabel: Record<VoiceRoute, string> = {
  chiefComplaint: "motif de consultation",
  onsetDuration: "durée d'apparition",
  hpiDescription: "description hpi",
  knownDiseases: "pathologies chroniques",
  lifestyle: "description hpi",
};

/** Maps the last clinician question to a clinical field. The doctor remains in control. */
const detectVoiceRoute = (transcript: string): VoiceRoute | null => {
  const text = normalizeVoiceText(transcript);
  if (/(ou.*(mal|douleur)|localisation.*douleur|comment.*douleur|intensite|echelle.*douleur|combien.*sur.*10)/.test(text)) return "hpiDescription";
  if (/(depuis quand|duree|combien de temps|debut des symptomes|quand.*commence)/.test(text)) return "onsetDuration";
  if (/(motif|qu est ce qui vous amene|pourquoi venez|quel est le probleme)/.test(text)) return "chiefComplaint";
  if (/(antecedent|maladie.*connue|operation.*passee|avez vous deja eu)/.test(text)) return "knownDiseases";
  if (/(tabac|fumez|alcool|habitude.*vie)/.test(text)) return "lifestyle";
  return null;
};

const cleanClinicalDictation = (value: string) => {
  const cleaned = value
    .replace(/\b(euh+|hum+|hein|voila|donc|en fait)\b/gi, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/([,.!?])\1+/g, "$1")
    .trim();
  if (!cleaned) return "";
  return `${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}`;
};

const extractAnswerAfterQuestion = (transcript: string, route: VoiceRoute) => {
  const patterns: Record<VoiceRoute, RegExp> = {
    chiefComplaint: /(motif|qu['’]?est[-\s]*ce qui vous amene|pourquoi venez|quel est le probleme)/i,
    onsetDuration: /(depuis quand|duree|combien de temps|debut des symptomes|quand.*commence)/i,
    hpiDescription: /(ou avez[-\s]*vous mal|ou as[-\s]*tu mal|localisation.*douleur|comment.*douleur|intensite|combien.*sur.*10)/i,
    knownDiseases: /(antecedent|maladie.*connue|operation.*passee|avez[-\s]*vous deja eu)/i,
    lifestyle: /(tabac|fumez|alcool|habitude.*vie)/i,
  };
  const match = patterns[route].exec(transcript);
  return cleanClinicalDictation(match ? transcript.slice(match.index + match[0].length).replace(/^[\s:;,.!?-]+/, "") : transcript);
};

function summarizeHistory(form: any, module: ConsultationModuleState) {
  const parts: string[] = [];
  if (form.onset) parts.push(`Début: ${form.onset}`);
  if (form.painLocation) parts.push(`Localisation: ${form.painLocation}`);
  if (form.intensity) parts.push(`Intensité: ${form.intensity}`);
  if (form.associatedSymptoms) parts.push(`Symptômes associés: ${form.associatedSymptoms}`);
  if (form.aggravatingFactors) parts.push(`Facteurs aggravants: ${form.aggravatingFactors}`);
  if (module.hpiDescription) parts.push(`Narratif: ${module.hpiDescription}`);
  if (form.previousTreatments) parts.push(`Traitements antérieurs: ${form.previousTreatments}`);
  if (form.functionalImpact) parts.push(`Impact fonctionnel: ${form.functionalImpact}`);
  return parts.length ? parts.join(" \n") : "";
}

function summarizeAntecedents(form: any, module: ConsultationModuleState) {
  const parts: string[] = [];
  if (form.knownDiseases) parts.push(`Maladies connues: ${form.knownDiseases}`);
  if (form.surgeries) parts.push(`Chirurgies: ${form.surgeries}`);
  if (form.allergies) parts.push(`Allergies: ${form.allergies}`);
  if (module.allergies?.length) parts.push(`Allergies détaillées: ${module.allergies.map((a) => `${a.allergen} (${a.reactionType})`).join(', ')}`);
  if (module.currentMedications?.length) parts.push(`Médicaments en cours: ${module.currentMedications.map((m) => `${m.drugName} ${m.dosage}`).join(', ')}`);
  return parts.length ? parts.join(" \n") : "";
}

function summarizeExam(form: any, module: ConsultationModuleState) {
  const parts: string[] = [];
  if (form.generalState) parts.push(`État général: ${form.generalState}`);
  if (form.auscultation) parts.push(`Auscultation: ${form.auscultation}`);
  if (form.palpation) parts.push(`Palpation: ${form.palpation}`);
  if (form.focusedExam) parts.push(`Examen ciblé: ${form.focusedExam}`);
  if (module.orderedExams?.length) parts.push(`Examens prescrits: ${module.orderedExams.map((e) => e.testName).join(', ')}`);
  return parts.length ? parts.join(" \n") : "";
}


type ConsultationModuleState = {
  consultationMode: string;
  chiefComplaint: string;
  arrivalMode: string;
  triagePriority: string;
  onsetDuration: string;
  onsetMode: string;
  triggeringFactors: string[];
  evolution: string;
  hpiDescription: string;
  allergies: Array<{ allergen: string; reactionType: string }>;
  chronicPathologies: Array<{ code: string; label: string }>;
  currentMedications: Array<{ drugName: string; dosage: string; compliance: "GOOD" | "IRREGULAR" | "STOPPED" }>;
  lifestyle: { smoking: string; alcohol: string; pregnancyStatus: boolean; gestationalAgeWeeks?: number };
  differentialDiagnoses: string[];
  selectedDiagnosis: { codeICD: string; label: string; certaintyLevel: "PRESUMPTION" | "CONFIRMED" | "CHRONIC" };
  performedProcedures: Array<{ code: string; description: string; cost: number }>;
  orderedExams: Array<{ category: "LABORATORY" | "IMAGING"; testName: string; urgency: "ROUTINE" | "URGENT"; clinicalIndication: string }>;
  prescriptions: Array<{ drugId: string; innName: string; brandName?: string; form: string; dosage: string; route: string; durationDays: number; pharmacyStockStatus: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK" }>;
  safetyAlerts: Array<{ type: "ALLERGY_WARNING" | "DRUG_INTERACTION" | "CONTRAINDICATION"; message: string }>;
  safetyConsignes: string;
  sickLeave: { active: boolean; durationDays?: number; startDate?: string };
  followUp: { recommendedInterval: string; specificDate?: string };
};

const createInitialConsultationModule = (): ConsultationModuleState => ({
  consultationMode: "PRESENTIAL",
  chiefComplaint: "",
  arrivalMode: "SPONTANEOUS",
  triagePriority: "GREEN",
  onsetDuration: "",
  onsetMode: "PROGRESSIVE",
  triggeringFactors: [],
  evolution: "STATIONARY",
  hpiDescription: "",
  allergies: [],
  chronicPathologies: [],
  currentMedications: [],
  lifestyle: { smoking: "NON_FUMEUR", alcohol: "AUCUNE", pregnancyStatus: false, gestationalAgeWeeks: 0 },
  differentialDiagnoses: [],
  selectedDiagnosis: { codeICD: "", label: "", certaintyLevel: "PRESUMPTION" },
  performedProcedures: [],
  orderedExams: [],
  prescriptions: [],
  safetyAlerts: [],
  safetyConsignes: "",
  sickLeave: { active: false, durationDays: 0, startDate: "" },
  followUp: { recommendedInterval: "", specificDate: "" },
});

const splitList = (value: string) => value.split(/\n|,/).map((item) => item.trim()).filter(Boolean);

export default function DashboardMedecin() {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const isConsultationPage = location.pathname.includes("/doctor/consultations");
  const [patients, setPatients] = useState<DoctorPatient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<DoctorPatient | null>(null);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [isConsultationOpen, setIsConsultationOpen] = useState(false);
  const [conflictMedication, setConflictMedication] = useState<any | null>(null);
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  const { isOpen: isConflictOpen, openModal: openConflictModal, closeModal: closeConflictModal } = useModal(false);
  
  const speechRecognitionRef = useRef<any>(null);
  const speechFinalTextRef = useRef("");
  const speechSilenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceRouteRef = useRef<VoiceRoute | null>(null);
  const voiceAnswerRef = useRef("");
  
  const [isVoiceListening, setIsVoiceListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceMessage, setVoiceMessage] = useState<string | null>(null);
  const [voiceTargetLabel, setVoiceTargetLabel] = useState<string | null>(null);
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
    // Complementary anamnesis fields
    systemReview: "",
    functionalImpact: "",
    previousTreatments: "",
  });
  const [historyDescription, setHistoryDescription] = useState("");
  const [antecedentsDescription, setAntecedentsDescription] = useState("");
  const [complementDescription, setComplementDescription] = useState("");
  const [examDescription, setExamDescription] = useState("");
  const [diagnosisDescription, setDiagnosisDescription] = useState("");
  const [consignesDescription, setConsignesDescription] = useState("");
  const [consultationModule, setConsultationModule] = useState<ConsultationModuleState>(createInitialConsultationModule);

  useEffect(() => {
    setHistoryDescription(summarizeHistory(clinicalForm, consultationModule));
    setAntecedentsDescription(summarizeAntecedents(clinicalForm, consultationModule));
    setExamDescription(summarizeExam(clinicalForm, consultationModule));
    setDiagnosisDescription((consultationModule.selectedDiagnosis && (consultationModule.selectedDiagnosis.label || consultationModule.selectedDiagnosis.codeICD)) || clinicalForm.principalDiagnosis || "");
    setConsignesDescription(clinicalForm.treatmentPlan || "");
    setComplementDescription([clinicalForm.systemReview, clinicalForm.functionalImpact].filter(Boolean).join(" \n") || "");
  }, [clinicalForm, consultationModule]);

  const [draftAllergy, setDraftAllergy] = useState({ allergen: "", reactionType: "" });
  const [draftMedication, setDraftMedication] = useState({ drugName: "", dosage: "", compliance: "GOOD" as "GOOD" | "IRREGULAR" | "STOPPED" });

  type ClinicalSummaryPayload = {
    medicalHistory?: {
      knownDiseases?: string;
      surgeries?: string;
      allergies?: string;
      currentMedications?: string;
      familyHistory?: string;
    };
    currentSymptoms?: {
      onset?: string;
      painLocation?: string;
      intensity?: string;
      aggravatingFactors?: string;
      associatedSymptoms?: string;
    };
    clinicalExam?: {
      generalState?: string;
      auscultation?: string;
      palpation?: string;
      focusedExam?: string;
    };
    diagnosis?: {
      principal?: string;
      hypotheses?: string[];
    };
    treatmentPlan?: {
      notes?: string;
    };
    followUp?: {
      notes?: string;
    };
  };

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

  // Nettoyage de la reconnaissance vocale au démontage pour libérer le micro
  useEffect(() => {
    return () => {
      if (speechRecognitionRef.current) {
        speechRecognitionRef.current.stop();
      }
      if (speechSilenceTimerRef.current) {
        clearTimeout(speechSilenceTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const consultation = selectedPatient?.latestConsultation || selectedPatient?.consultations?.[0];
    if (!consultation) return;

    let parsed: ClinicalSummaryPayload = {};
    try {
      parsed = consultation.clinicalSummary ? JSON.parse(consultation.clinicalSummary) as ClinicalSummaryPayload : {};
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
  }, [selectedPatient?.id, selectedPatient?.latestConsultation, selectedPatient?.consultations]);

  const currentConsultationId = selectedPatient?.latestConsultation?.id || selectedPatient?.consultations?.[0]?.id || "";

  const applyVoiceToConsultationModule = (transcript: string) => {
    const fields = extractClinicalVoiceFields(transcript);
    const detectedRoute = detectVoiceRoute(transcript);
    if (detectedRoute) {
      if (voiceRouteRef.current !== detectedRoute) voiceAnswerRef.current = "";
      voiceRouteRef.current = detectedRoute;
      const targetLabel = voiceRouteLabel[detectedRoute];
      setVoiceTargetLabel(targetLabel);
      window.setTimeout(() => {
        const target = document.querySelector<HTMLElement>(`[data-clinical-label="${targetLabel}"]`);
        target?.scrollIntoView({ behavior: "smooth", block: "center" });
        target?.focus();
      }, 0);
    }
    const route = voiceRouteRef.current;
    const answer = route ? extractAnswerAfterQuestion(transcript, route) : "";
    setConsultationModule((current) => {
      const next: ConsultationModuleState = { ...current };
      const previousAnswer = voiceAnswerRef.current;
      const hasNewAnswer = answer.length >= 2 && answer !== previousAnswer;
      if (hasNewAnswer) voiceAnswerRef.current = answer;
      if (hasNewAnswer && route === "chiefComplaint") {
        next.chiefComplaint = answer;
      }
      if (hasNewAnswer && route === "onsetDuration") {
        next.onsetDuration = answer;
      }
      if (hasNewAnswer && (route === "hpiDescription" || route === "lifestyle")) {
        next.hpiDescription = previousAnswer && next.hpiDescription.includes(previousAnswer)
          ? next.hpiDescription.replace(previousAnswer, answer)
          : appendClinicalValue(next.hpiDescription, answer);
      }
      if (hasNewAnswer && route === "knownDiseases") {
        next.chronicPathologies = [{ code: "DECLARED", label: answer }];
      }
      if (fields.chiefComplaint) {
        next.chiefComplaint = appendClinicalValue(current.chiefComplaint || next.chiefComplaint, fields.chiefComplaint);
      }
      if (fields.onset) {
        next.onsetDuration = fields.onset;
      }
      if (fields.painLocation) {
        next.hpiDescription = [next.hpiDescription, `Localisation: ${fields.painLocation}`].filter(Boolean).join(" | ");
      }
      if (fields.intensity) {
        next.hpiDescription = [next.hpiDescription, `Intensité: ${fields.intensity}`].filter(Boolean).join(" | ");
      }
      if (fields.associatedSymptoms) {
        next.hpiDescription = [next.hpiDescription, `Symptômes associés: ${fields.associatedSymptoms}`].filter(Boolean).join(" | ");
      }
      if (fields.aggravatingFactors) {
        next.hpiDescription = [next.hpiDescription, `Facteurs aggravants: ${fields.aggravatingFactors}`].filter(Boolean).join(" | ");
      }
      if (next.chiefComplaint && !next.selectedDiagnosis.label) {
        next.selectedDiagnosis = { codeICD: "R50.9", label: "Symptôme clinique non codé", certaintyLevel: "PRESUMPTION" };
      }
      setClinicalForm((currentForm) => ({
        ...currentForm,
        chiefComplaint: next.chiefComplaint || currentForm.chiefComplaint,
        onset: next.onsetDuration || currentForm.onset,
        associatedSymptoms: next.hpiDescription || currentForm.associatedSymptoms,
      }));
      return next;
    });
  };

  const saveDraftConsultation = async () => {
    if (!currentConsultationId) {
      setActionMessage("Aucune consultation active pour ce patient.");
      return;
    }
    setActionMessage(null);
    const consignesNotes = [
      consultationModule.safetyConsignes,
      consultationModule.sickLeave.active ? `Arrêt de travail: ${consultationModule.sickLeave.durationDays || 0} jour(s)` : "",
      consultationModule.followUp.recommendedInterval ? `Suivi: ${consultationModule.followUp.recommendedInterval}` : "",
      consultationModule.followUp.specificDate ? `Date de suivi: ${consultationModule.followUp.specificDate}` : "",
    ].filter(Boolean).join("\n");

    await saveClinicalSections(currentConsultationId, {
      chiefComplaint: clinicalForm.chiefComplaint,
      medicalHistory: {
        knownDiseases: clinicalForm.knownDiseases,
        surgeries: clinicalForm.surgeries,
        allergies: clinicalForm.allergies,
        currentMedications: clinicalForm.currentMedications,
        familyHistory: clinicalForm.familyHistory,
        description: antecedentsDescription,
      },
      currentSymptoms: {
        onset: clinicalForm.onset,
        painLocation: clinicalForm.painLocation,
        intensity: clinicalForm.intensity,
        aggravatingFactors: clinicalForm.aggravatingFactors,
        associatedSymptoms: clinicalForm.associatedSymptoms,
        description: historyDescription,
      },
      treatmentPlan: {
        notes: consignesNotes,
        description: consignesDescription,
      },
      followUp: {
        notes: consultationModule.followUp.recommendedInterval || consultationModule.followUp.specificDate ? `${consultationModule.followUp.recommendedInterval || ""}${consultationModule.followUp.recommendedInterval && consultationModule.followUp.specificDate ? " | " : ""}${consultationModule.followUp.specificDate || ""}` : "",
      },
      complementaryAnamnesis: complementDescription,
      consultationModule,
      consultationStatus: "DRAFT",
    });
    setActionMessage("Brouillon enregistré. Les informations sont prêtes pour la validation clinique.");
  };

  const validateConsultation = async () => {
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
        description: antecedentsDescription,
      },
      currentSymptoms: {
        onset: clinicalForm.onset,
        painLocation: clinicalForm.painLocation,
        intensity: clinicalForm.intensity,
        aggravatingFactors: clinicalForm.aggravatingFactors,
        associatedSymptoms: clinicalForm.associatedSymptoms,
        description: historyDescription,
      },
      clinicalExam: {
        generalState: clinicalForm.generalState,
        auscultation: clinicalForm.auscultation,
        palpation: clinicalForm.palpation,
        focusedExam: clinicalForm.focusedExam,
        description: examDescription,
      },
      diagnosis: {
        principal: clinicalForm.principalDiagnosis,
        hypotheses: clinicalForm.hypotheses.split("\n").map((item) => item.trim()).filter(Boolean),
        description: diagnosisDescription,
      },
      treatmentPlan: { notes: clinicalForm.treatmentPlan, description: consignesDescription },
      followUp: { notes: clinicalForm.followUp },
      complementaryAnamnesis: complementDescription,
      consultationModule,
      consultationStatus: "VALIDATED",
      validationSummary: {
        diagnosis: consultationModule.selectedDiagnosis.label || clinicalForm.principalDiagnosis,
        followUp: consultationModule.followUp.recommendedInterval || clinicalForm.followUp,
      },
    });
    setActionMessage("Consultation validée. Mise à jour des données cliniques...");
    // Refresh local list so other panels reflect the validated consultation
    try {
      await loadPatients();
    } catch (e) {
      // ignore - we still navigate but emit event to signal update
    }
    // Notify other parts of the app that clinical data changed
    try {
      window.dispatchEvent(new CustomEvent('d7:clinicalDataUpdated'));
      window.dispatchEvent(new CustomEvent('d7:patient.updated'));
      window.dispatchEvent(new CustomEvent('d7:consultation.created'));
    } catch (e) {
      // ignore
    }
    setActionMessage("Consultation validée. Vous pouvez maintenant finaliser l’ordonnance et les examens depuis les vues dédiées.");
    navigate("/doctor/prescriptions");
  };

  const resetConsultationModule = () => {
    setConsultationModule(createInitialConsultationModule());
    setDraftAllergy({ allergen: "", reactionType: "" });
    setDraftMedication({ drugName: "", dosage: "", compliance: "GOOD" });
    setClinicalForm((current) => ({ ...current, chiefComplaint: "", onset: "", associatedSymptoms: "", principalDiagnosis: "", hypotheses: "", treatmentPlan: "", followUp: "" }));
  };

  const addAllergy = () => {
    if (!draftAllergy.allergen.trim()) return;
    setConsultationModule((current) => ({
      ...current,
      allergies: [...current.allergies, { allergen: draftAllergy.allergen.trim(), reactionType: draftAllergy.reactionType.trim() || "Inconnue" }],
    }));
    setDraftAllergy({ allergen: "", reactionType: "" });
  };

  const addMedication = () => {
    if (!draftMedication.drugName.trim()) return;
    setConsultationModule((current) => ({
      ...current,
      currentMedications: [...current.currentMedications, { drugName: draftMedication.drugName.trim(), dosage: draftMedication.dosage.trim() || "1 comprimé", compliance: draftMedication.compliance }],
    }));
    setDraftMedication({ drugName: "", dosage: "", compliance: "GOOD" });
  };

  const addExamSuggestion = (exam: { category: "LABORATORY" | "IMAGING"; testName: string; urgency: "ROUTINE" | "URGENT"; clinicalIndication: string }) => {
    setConsultationModule((current) => ({
      ...current,
      orderedExams: [...current.orderedExams, exam],
    }));
  };

  const addPrescriptionSuggestion = (prescription: ConsultationModuleState["prescriptions"][number]) => {
    setConsultationModule((current) => ({
      ...current,
      prescriptions: [...current.prescriptions, prescription],
    }));
  };

  const addSafetyAlert = (message: string) => {
    setConsultationModule((current) => ({
      ...current,
      safetyAlerts: [...current.safetyAlerts, { type: "CONTRAINDICATION", message }],
    }));
  };

  const removeEntry = (key: "allergies" | "currentMedications" | "orderedExams" | "prescriptions" | "safetyAlerts", index: number) => {
    setConsultationModule((current) => ({
      ...current,
      [key]: current[key].filter((_, itemIndex) => itemIndex !== index),
    } as ConsultationModuleState));
  };

  // 🟢 AJOUT DE LA MÉTHODE MANQUANTE : toggleVoiceAssistant
  const toggleVoiceAssistant = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setVoiceMessage("Reconnaissance vocale non disponible; mode démonstration activé.");
      setIsVoiceListening(true);
      window.setTimeout(() => {
        const demoTranscript = "Le patient signale une douleur abdominale depuis deux jours avec fièvre légère.";
        setVoiceTranscript(demoTranscript);
        applyVoiceToConsultationModule(demoTranscript);
        setVoiceMessage("Exemple de dictée appliqué, vous pouvez corriger librement.");
        setIsVoiceListening(false);
      }, 1000);
      return;
    }

    if (isVoiceListening) {
      if (speechRecognitionRef.current) {
        speechRecognitionRef.current.stop();
      }
      setIsVoiceListening(false);
      setVoiceMessage("Assistance vocale désactivée.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "fr-FR";

    speechFinalTextRef.current = "";
    setVoiceTranscript("");
    setVoiceMessage("Écoute active... Parlez naturellement.");

    recognition.onresult = (event: any) => {
      let interimTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          speechFinalTextRef.current += event.results[i][0].transcript + " ";
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }

      const fullTranscript = (speechFinalTextRef.current + interimTranscript).trim();
      setVoiceTranscript(fullTranscript);
      applyVoiceToConsultationModule(fullTranscript);

      if (speechSilenceTimerRef.current) {
        clearTimeout(speechSilenceTimerRef.current);
      }
      speechSilenceTimerRef.current = setTimeout(() => {
        setVoiceMessage("Écoute en arrière-plan (silence temporaire)...");
      }, 3000);
    };

    recognition.onerror = (event: any) => {
      console.error("Erreur d'assistance vocale :", event.error);
      setVoiceMessage(`Erreur : ${event.error}`);
      setIsVoiceListening(false);
    };

    recognition.onend = () => {
      setIsVoiceListening(false);
      setVoiceMessage("Microphone désactivé.");
    };

    speechRecognitionRef.current = recognition;
    recognition.start();
    setIsVoiceListening(true);
  };

  const aiSuggestions = useMemo(() => {
    const complaintText = `${consultationModule.chiefComplaint} ${consultationModule.hpiDescription}`.toLowerCase();
    const diagnoses = [] as Array<{ codeICD: string; label: string; certaintyLevel: "PRESUMPTION" | "CONFIRMED" | "CHRONIC" }>;
    const exams = [] as Array<{ category: "LABORATORY" | "IMAGING"; testName: string; urgency: "ROUTINE" | "URGENT"; clinicalIndication: string }>;
    const prescriptions = [] as ConsultationModuleState["prescriptions"];
    const alerts = [] as ConsultationModuleState["safetyAlerts"];

    if (complaintText.includes("fièvre") || complaintText.includes("fievre") || complaintText.includes("fever")) {
      diagnoses.push({ codeICD: "R50.9", label: "Fièvre d’origine infectieuse", certaintyLevel: "PRESUMPTION" as const });
      exams.push({ category: "LABORATORY", testName: "NFS complète", urgency: "ROUTINE" as const, clinicalIndication: "Évaluation de l’infection et de l’état inflammatoire" });
      prescriptions.push({ drugId: "paracetamol", innName: "Paracétamol", form: "Comprimé", dosage: "500 mg", route: "Orale", durationDays: 3, pharmacyStockStatus: "IN_STOCK" as const });
    }
    if (complaintText.includes("toux") || complaintText.includes("difficulté respiratoire")) {
      diagnoses.push({ codeICD: "J18.9", label: "Pneumonie", certaintyLevel: "PRESUMPTION" as const });
      exams.push({ category: "LABORATORY", testName: "Radiographie thoracique", urgency: "URGENT" as const, clinicalIndication: "Évaluation d’un syndrome pulmonaire" });
    }
    if (complaintText.includes("douleur") && complaintText.includes("abdomen")) {
      diagnoses.push({ codeICD: "R10.9", label: "Douleur abdominale", certaintyLevel: "PRESUMPTION" as const });
      exams.push({ category: "LABORATORY", testName: "Hémogramme", urgency: "ROUTINE" as const, clinicalIndication: "Recherche d’une inflammation ou d’une infection" });
    }
    if (consultationModule.allergies.some((item) => item.allergen.toLowerCase().includes("pénic"))) {
      alerts.push({ type: "ALLERGY_WARNING", message: "Allergie connue détectée, vérifier la prescription avant validation." });
    }
    if (consultationModule.currentMedications.length) {
      alerts.push({ type: "DRUG_INTERACTION", message: "Contrôle des interactions médicamenteuses recommandé avant signature." });
    }

    return {
      diagnoses: diagnoses.slice(0, 3),
      exams: exams.slice(0, 3),
      prescriptions: prescriptions.slice(0, 2),
      alerts,
      followUp: consultationModule.followUp.recommendedInterval || "Revoir en 48h si l’état ne s’améliore pas.",
    };
  }, [consultationModule]);

  const findFrenchVoice = (voices: SpeechSynthesisVoice[]) => {
    const normalized = (voice: SpeechSynthesisVoice) => `${voice.lang || ''} ${voice.name || ''}`.toLowerCase();
    const femalePatterns = [
      'female', 'femme', 'française', 'francais', 'français',
      'amelie', 'marie', 'julie', 'celine', 'sylvie',
      'valerie', 'lea', 'lucie', 'dominique'
    ];
    const frenchVoices = voices.filter(
      (voice) =>
        voice.lang?.toLowerCase().startsWith('fr') ||
        voice.name?.toLowerCase().includes('french') ||
        voice.name?.toLowerCase().includes('français') ||
        voice.name?.toLowerCase().includes('francais'),
    );
    return (
      frenchVoices.find((voice) => femalePatterns.some((pattern) => normalized(voice).includes(pattern))) ||
      frenchVoices[0] ||
      voices.find((voice) => voice.lang?.toLowerCase().startsWith('fr')) ||
      voices[0]
    );
  };

  const callPatient = (patient: DoctorPatient) => {
    const doctorName = currentUser ? `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim() : 'le médecin';
    const text = `Patient ${patient.firstName || ''} ${patient.lastName || ''}, le docteur ${doctorName} vous attend au cabinet. Veuillez vous présenter immédiatement.`;
    if ('speechSynthesis' in window) {
      const speakWithVoice = (voices: SpeechSynthesisVoice[]) => {
        const frenchVoice = findFrenchVoice(voices);
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
  };

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
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => callPatient(selectedPatient)}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600"
                  >
                    Appeler le patient
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
                <Panel
                  title="Consultation medicale"
                  actions={
                    <button
                      type="button"
                      onClick={() => setIsConsultationOpen((current) => !current)}
                      className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700"
                    >
                      {isConsultationOpen ? "Fermer la consultation" : "Ouvrir la consultation"}
                    </button>
                  }
                >
                  {isConsultationOpen ? (
                    <>
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
                    {voiceTargetLabel && <p className="mt-1 text-xs text-blue-700 dark:text-blue-200">Champ ciblé : {voiceTargetLabel}.</p>}
                    {voiceTranscript && (
                      <div className="mt-3 max-h-28 overflow-y-auto rounded-lg border border-blue-100 bg-white p-3 text-xs leading-5 text-slate-700 dark:border-blue-900/60 dark:bg-slate-950 dark:text-slate-200">
                        {voiceTranscript}
                      </div>
                    )}
                  </div>

                  <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">Patient en consultation</p>
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{formatDoctorPatientName(selectedPatient)} • {serviceName(selectedPatient) || "Service non renseigné"}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => navigate("/doctor/prescriptions")} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">Ordonnance</button>
                        <button type="button" onClick={() => navigate("/doctor/exams")} className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700">Examens</button>
                      </div>
                    </div>
                  </div>

                  <SectionBox title="Mode de consultation">
                    <div className="grid gap-3 md:grid-cols-3">
                      <FormSelect label="Mode" value={consultationModule.consultationMode} onChange={(value) => setConsultationModule((current) => ({ ...current, consultationMode: value }))} options={[['PRESENTIAL','Présentiel'], ['TELECONSULTATION','Télésanté'], ['HOME_VISIT','Visite à domicile'], ['EMERGENCY','Urgence']]} />
                      <FormSelect label="Mode d'arrivée" value={consultationModule.arrivalMode} onChange={(value) => setConsultationModule((current) => ({ ...current, arrivalMode: value }))} options={[['SPONTANEOUS','Spontané'], ['AMBULATORY','Ambulatoire'], ['REFERRED','Orienté'], ['EMERGENCY_TRANSFER','Transfert urgence']]} />
                      <FormSelect label="Priorité de triage" value={consultationModule.triagePriority} onChange={(value) => setConsultationModule((current) => ({ ...current, triagePriority: value }))} options={[['GREEN','Normal'], ['YELLOW','Prioritaire'], ['RED','Urgent']]} />
                    </div>
                  </SectionBox>

                  <SectionBox title="Motif, triage et plainte principale">
                    <FormInput label="Motif de consultation" value={consultationModule.chiefComplaint} onChange={(value) => { setConsultationModule((current) => ({ ...current, chiefComplaint: value })); setClinicalForm((currentForm) => ({ ...currentForm, chiefComplaint: value })); }} />
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <FormInput label="Durée d'apparition" value={consultationModule.onsetDuration} onChange={(value) => setConsultationModule((current) => ({ ...current, onsetDuration: value }))} placeholder="Ex : 3 jours" />
                      <FormSelect label="Mode d'apparition" value={consultationModule.onsetMode} onChange={(value) => setConsultationModule((current) => ({ ...current, onsetMode: value }))} options={[['SUDDEN','Brutal'], ['PROGRESSIVE','Progressif'], ['RECURRENT','Récurrent'], ['EPISODIC','Épisodique']]} />
                      <FormInput label="Facteurs déclenchants" value={consultationModule.triggeringFactors.join(", ")} onChange={(value) => setConsultationModule((current) => ({ ...current, triggeringFactors: splitList(value) }))} placeholder="Ex : froid, effort" />
                      <FormSelect label="Évolution" value={consultationModule.evolution} onChange={(value) => setConsultationModule((current) => ({ ...current, evolution: value }))} options={[['IMPROVING', "S'améliore"], ['STATIONARY', 'Stable'], ['WORSENING', "S'aggrave"]]} />
                    </div>
                    <FormTextArea label="Description HPI" value={consultationModule.hpiDescription} onChange={(value) => { setConsultationModule((current) => ({ ...current, hpiDescription: value })); setClinicalForm((currentForm) => ({ ...currentForm, associatedSymptoms: value })); }} placeholder="Narratif clinique détaillé" />
                  </SectionBox>

                    <SectionBox title="Histoire de la maladie">
                      <div className="grid gap-3 md:grid-cols-2">
                        <FormInput label="Depuis quand ?" value={clinicalForm.onset} onChange={(value) => setClinicalForm((current) => ({ ...current, onset: value }))} placeholder="Ex: 3 jours" />
                        <FormSelect label="Intensité" value={clinicalForm.intensity} onChange={(value) => setClinicalForm((current) => ({ ...current, intensity: value }))} options={[["","Non precisee"],["1-3","Faible 1-3"],["4-6","Moderee 4-6"],["7-10","Severe 7-10"]]} />
                        <FormInput label="Localisation de la douleur / zone" value={clinicalForm.painLocation} onChange={(value) => setClinicalForm((current) => ({ ...current, painLocation: value }))} />
                        <SuggestionInput label="Symptômes associés" value={clinicalForm.associatedSymptoms} onChange={(value) => setClinicalForm((current) => ({ ...current, associatedSymptoms: value }))} suggestions={["Fievre","Nausees","Vomissements","Fatigue","Cephalees","Dyspnee","Toux"]} />
                        <FormTextArea label="Facteurs aggravants / soulageants" value={clinicalForm.aggravatingFactors} onChange={(value) => setClinicalForm((current) => ({ ...current, aggravatingFactors: value }))} />
                        <FormInput label="Traitements antérieurs (si existants)" value={clinicalForm.previousTreatments} onChange={(value) => setClinicalForm((current) => ({ ...current, previousTreatments: value }))} />
                        <FormTextArea label="Impact fonctionnel / activités" value={clinicalForm.functionalImpact} onChange={(value) => setClinicalForm((current) => ({ ...current, functionalImpact: value }))} />
                        <FormTextArea label="Description médicale (générée)" value={historyDescription} onChange={(value) => setHistoryDescription(value)} placeholder="Résumé médical automatique" />
                      </div>
                    </SectionBox>

                  <SectionBox title="Antécédents et habitudes">
                    <div className="grid gap-3 md:grid-cols-2">
                      <SuggestionInput label="Maladies connues" value={clinicalForm.knownDiseases} onChange={(value) => setClinicalForm((current) => ({ ...current, knownDiseases: value }))} suggestions={["Diabète", "Hypertension artérielle", "Asthme", "Epilepsie", "Insuffisance rénale", "VIH"]} />
                      <FormTextArea label="Chirurgies antérieures" value={clinicalForm.surgeries} onChange={(value) => setClinicalForm((current) => ({ ...current, surgeries: value }))} placeholder="Liste des interventions et dates" />
                      <FormTextArea label="Antécédents familiaux importants" value={clinicalForm.familyHistory} onChange={(value) => setClinicalForm((current) => ({ ...current, familyHistory: value }))} placeholder="Antécédents familiaux pertinents" />
                      <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Allergies</p>
                        <div className="mt-2 flex gap-2">
                          <input value={draftAllergy.allergen} onChange={(event) => setDraftAllergy((current) => ({ ...current, allergen: event.target.value }))} placeholder="Allergène" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
                          <input value={draftAllergy.reactionType} onChange={(event) => setDraftAllergy((current) => ({ ...current, reactionType: event.target.value }))} placeholder="Réaction" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
                        </div>
                        <button type="button" onClick={addAllergy} className="mt-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white">Ajouter</button>
                        <div className="mt-3 space-y-2">{consultationModule.allergies.map((item, index) => <div key={`${item.allergen}-${index}`} className="rounded-lg bg-white p-2 text-xs dark:bg-slate-900"><div className="flex items-center justify-between gap-2"><span className="font-semibold text-slate-700 dark:text-slate-200">{item.allergen}</span><button type="button" onClick={() => removeEntry("allergies", index)} className="text-red-600">Suppr.</button></div><p className="mt-1 text-slate-500">{item.reactionType}</p></div>)}</div>
                      </div>
                      <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Médicaments en cours</p>
                        <div className="mt-2 flex flex-col gap-2">
                          <input value={draftMedication.drugName} onChange={(event) => setDraftMedication((current) => ({ ...current, drugName: event.target.value }))} placeholder="Nom du médicament" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
                          <input value={draftMedication.dosage} onChange={(event) => setDraftMedication((current) => ({ ...current, dosage: event.target.value }))} placeholder="Dosage" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
                          <FormSelect label="Observance" value={draftMedication.compliance} onChange={(value) => setDraftMedication((current) => ({ ...current, compliance: value as "GOOD" | "IRREGULAR" | "STOPPED" }))} options={[['GOOD','Bonne'], ['IRREGULAR','Irrégulière'], ['STOPPED','Arrêtée']]} />
                        </div>
                        <button type="button" onClick={addMedication} className="mt-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white">Ajouter</button>
                        <div className="mt-3 space-y-2">{consultationModule.currentMedications.map((item, index) => <div key={`${item.drugName}-${index}`} className="rounded-lg bg-white p-2 text-xs dark:bg-slate-900"><div className="flex items-center justify-between gap-2"><span className="font-semibold text-slate-700 dark:text-slate-200">{item.drugName}</span><button type="button" onClick={() => removeEntry("currentMedications", index)} className="text-red-600">Suppr.</button></div><p className="mt-1 text-slate-500">{item.dosage} • {item.compliance}</p></div>)}</div>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <FormTextArea label="Pathologies chroniques" value={consultationModule.chronicPathologies.map((item) => `${item.code} - ${item.label}`).join("\n")} onChange={(value) => setConsultationModule((current) => ({ ...current, chronicPathologies: splitList(value).map((item) => ({ code: item, label: item })) }))} placeholder="Code - libellé" />
                      <div className="grid gap-3">
                        <FormSelect label="Tabagisme" value={consultationModule.lifestyle.smoking} onChange={(value) => setConsultationModule((current) => ({ ...current, lifestyle: { ...current.lifestyle, smoking: value } }))} options={[['NON_FUMEUR','Non fumeur'], ['OCCASIONAL','Occasionnel'], ['REGULAR','Régulier']]} />
                        <FormSelect label="Alcool" value={consultationModule.lifestyle.alcohol} onChange={(value) => setConsultationModule((current) => ({ ...current, lifestyle: { ...current.lifestyle, alcohol: value } }))} options={[['AUCUNE','Aucune'], ['OCCASIONAL','Occasionnel'], ['REGULAR','Régulier']]} />
                        <FormSelect label="Grossesse" value={consultationModule.lifestyle.pregnancyStatus ? "true" : "false"} onChange={(value) => setConsultationModule((current) => ({ ...current, lifestyle: { ...current.lifestyle, pregnancyStatus: value === 'true' } }))} options={[['false','Non'], ['true','Oui']]} />
                      </div>
                    </div>
                  </SectionBox>

                  <SectionBox title="Examens complémentaires et procédures">
                    <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 dark:border-sky-900/40 dark:bg-sky-950/30">
                      <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Suggestions IA</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {aiSuggestions.exams.map((item) => (
                          <button key={`${item.testName}-${item.category}`} type="button" onClick={() => addExamSuggestion(item)} className="rounded-full border border-sky-200 bg-white px-3 py-1 text-xs font-semibold text-sky-700">{item.testName}</button>
                        ))}
                      </div>
                    </div>
                    <div className="mt-3 space-y-2">{consultationModule.orderedExams.map((item, index) => <div key={`${item.testName}-${index}`} className="rounded-lg bg-white p-3 text-sm dark:bg-slate-900"><div className="flex items-center justify-between gap-2"><span className="font-semibold text-slate-700 dark:text-slate-200">{item.testName}</span><button type="button" onClick={() => removeEntry("orderedExams", index)} className="text-red-600">Suppr.</button></div><p className="mt-1 text-slate-500">{item.category} • {item.urgency} • {item.clinicalIndication}</p></div>)}</div>
                  </SectionBox>

                  <SectionBox title="Ordonnance, sécurité et pharmacie">
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900/40 dark:bg-emerald-950/30">
                      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Suggestions IA</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {aiSuggestions.prescriptions.map((item) => (
                          <button key={`${item.drugId}-${item.innName}`} type="button" onClick={() => addPrescriptionSuggestion(item)} className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-semibold text-emerald-700">{item.innName} • {item.form}</button>
                        ))}
                      </div>
                    </div>
                    <div className="mt-3 space-y-2">{consultationModule.prescriptions.map((item, index) => <div key={`${item.drugId}-${index}`} className="rounded-lg bg-white p-3 text-sm dark:bg-slate-900"><div className="flex items-center justify-between gap-2"><span className="font-semibold text-slate-700 dark:text-slate-200">{item.innName}</span><button type="button" onClick={() => removeEntry("prescriptions", index)} className="text-red-600">Suppr.</button></div><p className="mt-1 text-slate-500">{item.dosage} • {item.route} • {item.durationDays} jours • Stock {item.pharmacyStockStatus}</p></div>)}</div>
                    <div className="mt-3 space-y-2">{consultationModule.safetyAlerts.map((item, index) => <div key={`${item.type}-${index}`} className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{item.message}</div>)}</div>
                  </SectionBox>

                  <SectionBox title="Consignes, arrêt de travail et suivi">
                    <FormTextArea label="Consignes de sécurité" value={consultationModule.safetyConsignes} onChange={(value) => setConsultationModule((current) => ({ ...current, safetyConsignes: value }))} placeholder="Signes d'alerte et conduite à tenir" />
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <FormSelect label="Arrêt de travail" value={consultationModule.sickLeave.active ? "true" : "false"} onChange={(value) => setConsultationModule((current) => ({ ...current, sickLeave: { ...current.sickLeave, active: value === 'true' } }))} options={[['false','Non'], ['true','Oui']]} />
                      <FormInput label="Durée (jours)" value={consultationModule.sickLeave.durationDays?.toString() || ""} onChange={(value) => setConsultationModule((current) => ({ ...current, sickLeave: { ...current.sickLeave, durationDays: Number(value) || 0 } }))} />
                      <FormInput label="Intervalle de suivi" value={consultationModule.followUp.recommendedInterval} onChange={(value) => setConsultationModule((current) => ({ ...current, followUp: { ...current.followUp, recommendedInterval: value } }))} />
                      <FormInput label="Date de suivi" value={consultationModule.followUp.specificDate || ""} onChange={(value) => setConsultationModule((current) => ({ ...current, followUp: { ...current.followUp, specificDate: value } }))} placeholder="YYYY-MM-DD" />
                    </div>
                  </SectionBox>

                  <div className="sticky bottom-3 mt-4 flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                    <button type="button" onClick={resetConsultationModule} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">Effacer / réinitialiser</button>
                    <button type="button" onClick={saveDraftConsultation} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white">Enregistrer brouillon</button>
                    <button type="button" onClick={validateConsultation} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white">Valider et signer</button>
                  </div>
                  </>
                  ) : (
                    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
                      La consultation est actuellement fermée. Ouvrez-la pour saisir le dossier clinique et les actes associés.
                    </div>
                  )}
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
                      <Item key={prescription.id} title={translatePrescriptionStatus(prescription.status)} subtitle={formatDateTime(prescription.prescribingDate)} text={prescription.instruction || prescription.lineItems?.map((line: any) => [line.dosage, line.frequency, line.notes].filter(Boolean).join(" - ")).join(", ") || "Prescription sans detail."} />
                    ))
                  )}
                </Panel>

                <Panel title="Examens laboratoire">
                  {(selectedPatient.labRequests || []).length === 0 ? (
                    <Empty />
                  ) : (
                    selectedPatient.labRequests?.map((request) => (
                      <Item
                        key={request.id}
                        title={request.specimenType || request.status}
                        subtitle={formatDateTime(request.requestedAt)}
                        text={
                          request.results?.length
                            ? request.results
                                .map((result: any) => formatLabResultTextWithReference(result))
                                .join("\n")
                            : "Resultat en attente."
                        }
                      />
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

function Panel({ title, children, actions }: { title: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold text-slate-900 dark:text-white">{title}</h3>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      <div className="mt-3 space-y-3">{children}</div>
    </div>
  );
}

function Item({ title, subtitle, text }: { title: string; subtitle: string; text: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-950">
      <p className="font-semibold text-slate-900 dark:text-white">{title}</p>
      <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
      <p className="mt-2 whitespace-pre-line text-slate-600 dark:text-slate-300">{text}</p>
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
        data-clinical-label={normalizeVoiceText(label)}
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
        data-clinical-label={normalizeVoiceText(label)}
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

// 🟢 AJOUT DE LA MÉTHODE MANQUANTE : formatLabResultTextWithReference (évite le plantage sur l'onglet Labo)
function formatLabResultTextWithReference(result: any) {
  if (!result) return "";
  const name = result.analyteName || result.name || result.resultName || "Test";
  const val = result.resultValue ?? result.value ?? result.result ?? result.result_value ?? "";
  const unitRaw = result.units || result.unit || result.u || "";
  const unit = unitRaw ? String(unitRaw).trim() : "";
  const referenceRaw = result.referenceRange ?? result.reference ?? result.reference_range ?? "";
  const reference = referenceRaw ? String(referenceRaw).trim() : "";

  const displayVal = val === null || val === undefined || String(val).trim() === "" ? "" : `${String(val).trim()}${unit ? ` ${unit}` : ""}`;

  // Ensure we don't append the unit to the reference if it's already present in the reference string
  let referenceDisplay = reference;
  if (referenceDisplay && unit) {
    const refLower = referenceDisplay.toLowerCase();
    const unitLower = unit.toLowerCase();
    if (!refLower.includes(unitLower)) {
      referenceDisplay = `${referenceDisplay} ${unit}`;
    }
  }

  const range = referenceDisplay ? ` (Norme: ${referenceDisplay})` : "";

  return displayVal ? `${name}: ${displayVal}${referenceDisplay ? ` ${range}` : ""}` : `${name}${range ? ` ${range}` : ""}`;
}

function translatePrescriptionStatus(status?: string | null) {
  if (!status) return "Statut inconnu";
  const s = String(status).trim().toUpperCase();
  switch (s) {
    case "PENDING":
    case "AWAITING":
      return "En attente";
    case "ACTIVE":
    case "ISSUED":
      return "Active";
    case "COMPLETED":
    case "DONE":
      return "Terminé";
    case "DISPENSED":
      return "Dispensé";
    case "CANCELLED":
    case "CANCELED":
      return "Annulée";
    case "DRAFT":
      return "Brouillon";
    default:
      return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
  }
}
