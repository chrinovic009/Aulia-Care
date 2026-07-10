import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { playNotificationSound } from "../../utils/notificationSound";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import {
  DoctorPatient,
  fetchDoctorAssignedPatients,
  formatDoctorPatientName,
  saveClinicalSections,
} from "../../api/doctor";

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

export default function DashboardMedecin() {
  const location = useLocation();
  const isConsultationPage = location.pathname.includes("/doctor/consultations");
  const { currentUser } = useAuth();
  const [patients, setPatients] = useState<DoctorPatient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<DoctorPatient | null>(null);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
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

  const findFrenchVoice = (voices: SpeechSynthesisVoice[]) => {
    const normalized = (voice: SpeechSynthesisVoice) => `${voice.lang || ''} ${voice.name || ''}`.toLowerCase();
    const femalePatterns = [
      'female',
      'femme',
      'française',
      'francais',
      'français',
      'amelie',
      'marie',
      'julie',
      'celine',
      'sylvie',
      'valerie',
      'lea',
      'lucie',
      'dominique',
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

    try {
      playNotificationSound();
    } catch {
      // ignore audio errors
    }

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
                <Panel title="Consultation medicale">
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
                      <Item
                        key={request.id}
                        title={request.specimenType || request.status}
                        subtitle={formatDateTime(request.requestedAt)}
                        text={
                          request.results?.length
                            ? request.results
                                .map((result) => `${result.resultName || "Résultat"}: ${result.resultValue?.trim() || "Non renseigné"}${result.units ? ` ${result.units}` : ""}`)
                                .join(", ")
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
