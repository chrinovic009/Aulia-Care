import { useEffect, useMemo, useState } from "react";
import type { DoctorPatient } from "../../api/doctor";

type Item = Record<string, string>;
type Treatment = { medication: string; duration: string; impact: string };
export type StructuredConsultation = {
  illness: {
    duration: string;
    onsetMode: string;
    onsetAt: string;
    location: string;
    previousTreatmentKnown: boolean;
    previousTreatments: Treatment[];
  };
  antecedents: {
    medical: Item[];
    surgical: Item[];
    family: Item[];
    allergies: Item[];
    habits: Item[];
    womenHealth: Item[];
    pediatric: Item[];
    social: Item[];
  };
  anamnesis: {
    symptom: string;
    trigger: string;
    relievingFactors: string;
    irradiation: string;
    types: string;
    temporalProfile: string;
    generalSymptoms: string;
    digestiveSymptoms: string;
    cardioRespiratorySymptoms: string;
    neurologicalSymptoms: string;
    redFlags: string;
  };
  physical: Record<string, string>;
  orientation: Record<string, string>;
  care: {
    nonPharma: string;
    therapeuticGoal: string;
    followUpOwner: string;
    nextAppointment: string;
    appointmentReason: string;
    controlTests: string;
    selfMonitoring: string;
    thresholds: string;
    safetyInstructions: string;
    patientInformed: boolean;
    homeContext: string;
  };
};
export const createInitialStructuredConsultation =
  (): StructuredConsultation => ({
    illness: {
      duration: "",
      onsetMode: "",
      onsetAt: "",
      location: "",
      previousTreatmentKnown: false,
      previousTreatments: [],
    },
    antecedents: {
      medical: [],
      surgical: [],
      family: [],
      allergies: [],
      habits: [],
      womenHealth: [],
      pediatric: [],
      social: [],
    },
    anamnesis: {
      symptom: "",
      trigger: "",
      relievingFactors: "",
      irradiation: "",
      types: "",
      temporalProfile: "",
      generalSymptoms: "",
      digestiveSymptoms: "",
      cardioRespiratorySymptoms: "",
      neurologicalSymptoms: "",
      redFlags: "ABSENT",
    },
    physical: {
      position: "ASSIS",
      oxygenSupport: "AIR_AMBIANT",
      temperatureSite: "AXILLAIRE",
      abdominalCircumference: "",
      armCircumference: "",
      specialist: "",
      specialistNote: "",
      notes: "",
      generalState: "",
      palpations: "",
      ent: "",
      cardiovascular: "",
      respiratory: "",
      abdominal: "",
      neurological: "",
      musculoskeletal: "",
      urogenital: "",
      functionalSafety: "",
    },
    orientation: {
      diagnosisType: "HYPOTHESE_TRAVAIL",
      icdCode: "",
      snomedCode: "",
      diagnosisLabel: "",
      certainty: "A_CONFIRMER",
      stage: "",
      disposition: "",
      destination: "",
      urgency: "U4",
      safetyNet: "",
      specialistOpinion: "",
      rcp: "NON",
      liaisonType: "COMPTE_RENDU",
      liaisonStatus: "BROUILLON",
      followUp: "",
      delay: "",
    },
    care: {
      nonPharma: "",
      therapeuticGoal: "",
      followUpOwner: "MEDECIN_GENERALISTE",
      nextAppointment: "",
      appointmentReason: "",
      controlTests: "",
      selfMonitoring: "",
      thresholds: "",
      safetyInstructions: "",
      patientInformed: false,
      homeContext: "",
    },
  });

const codes: Array<[string, string]> = [
  ["diabète", "E11.9"],
  ["hypertension", "I10"],
  ["asthme", "J45.9"],
  ["épilepsie", "G40.9"],
  ["insuffisance rénale", "N18.9"],
  ["douleur abdominale", "R10.9"],
];
const codeFor = (value: string) =>
  codes.find(([term]) => value.toLocaleLowerCase("fr").includes(term))?.[1] ||
  "";
const parseNumber = (value?: string) =>
  Number(value?.replace(",", ".").match(/\d+(?:\.\d+)?/)?.[0] || 0);
const ageOf = (date?: string | null) => {
  if (!date) return "Non renseigné";
  const birth = new Date(date);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  if (today < new Date(today.getFullYear(), birth.getMonth(), birth.getDate()))
    age--;
  return `${age} ans`;
};
const admissionOf = (patient: DoctorPatient) =>
  patient.arrivalAt ||
  patient.hospitalizations?.[0]?.admittedAt ||
  patient.latestConsultation?.createdAt;
const steps = [
  "Motif",
  "Histoire",
  "Antécédents",
  "Anamnèse",
  "Examen physique",
  "Examens complémentaires",
  "Ordonnance",
  "Orientation",
  "Prise en charge",
];
const antecedentPages = [
  "Médicaux",
  "Chirurgicaux & obstétrique",
  "Allergies",
  "Traitements & vaccins",
  "Mode de vie",
  "Familiaux",
  "Socio-professionnel",
  "Pédiatrie",
];
const physicalPages = [
  "Constantes",
  "État général",
  "Palpations",
  "Tête & sens",
  "Cardiovasculaire",
  "Respiratoire",
  "Digestif",
  "Neurologique",
  "Ostéo-articulaire",
  "Urogénital",
  "Autonomie & sécurité",
];
type Props = {
  patient: DoctorPatient;
  mode: string;
  complaint: string;
  onComplaintChange: (value: string) => void;
  value: StructuredConsultation;
  onChange: (value: StructuredConsultation) => void;
  hasAvailableResults: boolean;
  examinationsSlot?: React.ReactNode;
  prescriptionSlot?: React.ReactNode;
};

export function ClinicalConsultationWorkspace({
  patient,
  mode,
  complaint,
  onComplaintChange,
  value,
  onChange,
  hasAvailableResults,
  examinationsSlot,
  prescriptionSlot,
}: Props) {
  const [step, setStep] = useState(0),
    [historyPage, setHistoryPage] = useState(0),
    [examPage, setExamPage] = useState(0);
  const [draft, setDraft] = useState<Item>({}),
    [treatment, setTreatment] = useState<Treatment>({
      medication: "",
      duration: "",
      impact: "",
    });
  useEffect(() => {
    if (mode === "EMERGENCY") setStep(4);
  }, [mode]);
  const patch = <K extends keyof StructuredConsultation>(
    section: K,
    data: Partial<StructuredConsultation[K]>,
  ) => onChange({ ...value, [section]: { ...value[section], ...data } });
  const vitalMap = useMemo(
    () =>
      new Map(
        (patient.vitalSigns || []).map((v) => [
          v.type,
          `${v.value}${v.unit ? ` ${v.unit}` : ""}`,
        ]),
      ),
    [patient.vitalSigns],
  );
  const rawHeight = parseNumber(vitalMap.get("HEIGHT"));
  const height = rawHeight > 3 ? rawHeight / 100 : rawHeight;
  const weight = parseNumber(vitalMap.get("WEIGHT"));
  const bmi =
    weight && height ? `${(weight / height ** 2).toFixed(1)} kg/m²` : "—";
  const add = (
    key: keyof StructuredConsultation["antecedents"],
    required?: string,
  ) => {
    if (required && !draft[required]?.trim()) return;
    patch("antecedents", { [key]: [...value.antecedents[key], draft] });
    setDraft({});
  };
  const remove = (
    key: keyof StructuredConsultation["antecedents"],
    index: number,
  ) =>
    patch("antecedents", {
      [key]: value.antecedents[key].filter((_, i) => i !== index),
    });
  const addTreatment = () => {
    if (!treatment.medication.trim()) return;
    patch("illness", {
      previousTreatments: [...value.illness.previousTreatments, treatment],
    });
    setTreatment({ medication: "", duration: "", impact: "" });
  };
  const setDraftField = (key: string, value: string) =>
    setDraft((current) => ({
      ...current,
      [key]: key === "label" ? value : value,
      ...(key === "label" && !current.code ? { code: codeFor(value) } : {}),
    }));
  const field = (
    label: string,
    key: string,
    suggestions?: string[],
    type?: string,
  ) => (
    <Suggest
      label={label}
      value={draft[key] || ""}
      onChange={(next) => setDraftField(key, next)}
      suggestions={suggestions || []}
      type={type}
    />
  );
  const physical = (key: string) => value.physical[key] || "";
  const setPhysical = (key: string, next: string) =>
    patch("physical", { [key]: next });

  return (
    <section className="mt-4 overflow-hidden rounded-2xl border border-aulia-teal/20 bg-white shadow-sm dark:bg-slate-950">
      <header className="border-b border-aulia-teal/15 bg-gradient-to-r from-aulia-mist to-white px-4 py-4 dark:from-aulia-teal/15 dark:to-slate-950 sm:px-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.16em] text-aulia-teal">
              Consultation médicale · brouillon sécurisé
            </p>
            <h3 className="mt-1 text-lg font-bold text-aulia-navy dark:text-white">
              {[patient.firstName, patient.middleName, patient.lastName]
                .filter(Boolean)
                .join(" ")}
            </h3>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              {ageOf(patient.dateOfBirth)} ·{" "}
              {patient.gender || "Sexe non renseigné"} · Dernière admission :{" "}
              {admissionOf(patient)
                ? new Intl.DateTimeFormat("fr-FR", {
                    dateStyle: "medium",
                  }).format(new Date(admissionOf(patient)!))
                : "Aucune"}
            </p>
          </div>
          <span className="w-fit rounded-full bg-aulia-teal/15 px-3 py-1 text-xs font-bold text-aulia-teal">
            {mode === "EMERGENCY"
              ? "Parcours urgence"
              : mode === "HOME_VISIT"
                ? "Visite à domicile"
                : "Consultation présentielle"}
          </span>
        </div>
      </header>
      <div className="border-b border-slate-200 px-3 py-3 dark:border-slate-800">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {steps.map((name, index) => (
            <button
              type="button"
              key={name}
              onClick={() => setStep(index)}
              className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold ${step === index ? "bg-aulia-teal text-white" : "bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300"}`}
            >
              {index + 1}. {name}
              {index === 5 && !hasAvailableResults ? " · en attente" : ""}
            </button>
          ))}
        </div>
      </div>
      <div className="max-h-[min(61dvh,720px)] overflow-y-auto overscroll-contain p-4 sm:p-5">
        {step === 0 && (
          <Step
            title="Motif, triage et plainte principale"
            hint="Formulez clairement la plainte clinique."
          >
            <Text
              label="Plainte principale"
              value={complaint}
              onChange={onComplaintChange}
              placeholder="Ex. douleur épigastrique irradiant vers le dos"
            />
            <div className="grid gap-3 md:grid-cols-2">
              <Select
                label="Priorité de triage"
                value={(patient.priority || "GREEN").toUpperCase()}
                onChange={() => undefined}
                disabled
                options={[
                  ["GREEN", "Vert · stable"],
                  ["YELLOW", "Jaune · prioritaire"],
                  ["RED", "Rouge · critique"],
                ]}
              />
              <Text
                label="Orientation initiale"
                value={patient.workflowStatus || ""}
                onChange={() => undefined}
                disabled
              />
            </div>
          </Step>
        )}
        {step === 1 && (
          <Step
            title="Histoire de la maladie"
            hint="Le début et l’évolution sont ici ; l’intensité, les facteurs et l’impact fonctionnel sont volontairement absents."
          >
            <div className="grid gap-3 md:grid-cols-2">
              <Suggest
                label="Durée / apparition"
                value={value.illness.duration}
                onChange={(duration) => patch("illness", { duration })}
                suggestions={[
                  "Depuis quelques heures",
                  "Depuis 24 heures",
                  "Depuis 3 jours",
                  "Depuis une semaine",
                ]}
              />
              <Select
                label="Mode de début"
                value={value.illness.onsetMode}
                onChange={(onsetMode) => patch("illness", { onsetMode })}
                options={[
                  ["", "À préciser"],
                  ["SOUDAIN", "Soudain / brutal"],
                  ["PROGRESSIF", "Progressif"],
                  ["PAROXYSMIQUE", "Paroxysmique"],
                  ["INSIDIEUX", "Insidieux"],
                ]}
              />
              <Text
                label="Date / heure de début"
                type="datetime-local"
                value={value.illness.onsetAt}
                onChange={(onsetAt) => patch("illness", { onsetAt })}
              />
              <Suggest
                label="Localisation de la douleur"
                value={value.illness.location}
                onChange={(location) => patch("illness", { location })}
                suggestions={[
                  "Épigastre",
                  "Fosse iliaque droite",
                  "Thorax",
                  "Lombes",
                  "Céphalée",
                ]}
              />
            </div>
            <Select
              label="Traitements antérieurs"
              value={value.illness.previousTreatmentKnown ? "OUI" : "NON"}
              onChange={(answer) =>
                patch("illness", { previousTreatmentKnown: answer === "OUI" })
              }
              options={[
                ["NON", "Non"],
                ["OUI", "Oui"],
              ]}
            />
            {value.illness.previousTreatmentKnown && (
              <Entry title="Traitements déjà essayés">
                <div className="grid gap-2 md:grid-cols-3">
                  <Text
                    label="Médicament"
                    value={treatment.medication}
                    onChange={(medication) =>
                      setTreatment({ ...treatment, medication })
                    }
                  />
                  <Text
                    label="Durée"
                    value={treatment.duration}
                    onChange={(duration) =>
                      setTreatment({ ...treatment, duration })
                    }
                  />
                  <Suggest
                    label="Impact"
                    value={treatment.impact}
                    onChange={(impact) =>
                      setTreatment({ ...treatment, impact })
                    }
                    suggestions={[
                      "Inefficace",
                      "Partiellement efficace",
                      "Efficace",
                      "Effet indésirable",
                    ]}
                  />
                </div>
                <Add onClick={addTreatment}>Ajouter le traitement</Add>
                <Rows
                  items={value.illness.previousTreatments}
                  label={(item) =>
                    `${item.medication} · ${item.duration || "durée non précisée"} · ${item.impact || "impact non précisé"}`
                  }
                  onRemove={(index) =>
                    patch("illness", {
                      previousTreatments:
                        value.illness.previousTreatments.filter(
                          (_, i) => i !== index,
                        ),
                    })
                  }
                />
              </Entry>
            )}
          </Step>
        )}
        {step === 2 && (
          <Step
            title="Antécédents structurés"
            hint="Les blocs sont indépendants et se parcourent de gauche à droite."
          >
            <Pager
              labels={antecedentPages}
              page={historyPage}
              setPage={setHistoryPage}
            />
            {historyPage === 0 && (
              <Entry title="Antécédents médicaux">
                <Grid>
                  {field("Pathologie", "label", [
                    "Diabète",
                    "Hypertension artérielle",
                    "Asthme",
                    "Épilepsie",
                    "Insuffisance rénale",
                  ])}
                  {field("Code pathologie · à vérifier", "code")}
                  {field("Statut", "status", [
                    "Actif",
                    "En rémission",
                    "Guéri",
                    "Séquelles",
                  ])}
                  {field("Date début / diagnostic", "onset", [], "date")}
                  {field("Date fin / rémission", "end", [], "date")}
                  {field("Sévérité / stade", "severity", [
                    "Léger",
                    "Modéré",
                    "Sévère",
                    "Stade I",
                    "Stade II",
                    "Stade III",
                    "Stade IV",
                  ])}
                  {field("Spécialité / médecin référent", "specialty")}
                  {field("Traitement associé", "treatment")}
                  {field("Notes cliniques", "notes")}
                </Grid>
                <Add onClick={() => add("medical", "label")}>
                  Ajouter l’antécédent médical
                </Add>
                <Rows
                  items={value.antecedents.medical}
                  label={(x) =>
                    `${x.label || "Pathologie"} ${x.code ? `(${x.code})` : ""} · ${x.status || "statut non précisé"}`
                  }
                  onRemove={(i) => remove("medical", i)}
                />
              </Entry>
            )}
            {historyPage === 1 && (
              <>
                <Entry title="Antécédents chirurgicaux">
                  <Grid>
                    {field("Acte / intervention", "label")}
                    {field("Code intervention", "code")}
                    {field("Date intervention", "date", [], "date")}
                    {field("Établissement / chirurgien", "facility")}
                    {field("Voie d’abord / technique", "technique", [
                      "Cœlioscopie",
                      "Laparotomie",
                      "Endovasculaire",
                      "Chirurgie ouverte",
                    ])}
                    {field("Implant / dispositif", "implant", [
                      "Prothèse",
                      "Valve",
                      "Stent",
                      "Pacemaker",
                      "Ostéosynthèse",
                      "Aucun",
                    ])}
                    {field(
                      "Complications opératoires / anesthésiques",
                      "complication",
                      [
                        "Aucune",
                        "Hémorragie",
                        "Infection",
                        "Intubation difficile",
                        "TVP post-opératoire",
                      ],
                    )}
                    {field("Précisions", "notes")}
                  </Grid>
                  <Add onClick={() => add("surgical", "label")}>
                    Ajouter l’antécédent chirurgical
                  </Add>
                  <Rows
                    items={value.antecedents.surgical}
                    label={(x) =>
                      `${x.label || "Intervention"} · ${x.date || "date non précisée"}`
                    }
                    onRemove={(i) => remove("surgical", i)}
                  />
                </Entry>
                <Entry title="Santé gynéco-obstétrique (si applicable)">
                  <Grid>
                    {field("Âge des ménarches", "menarcheAge")}
                    {field(
                      "Dernières règles (DDR)",
                      "lastMenstrualPeriod",
                      [],
                      "date",
                    )}
                    {field("Ménopause / THM", "menopause")}
                    {field("Gravidité (G)", "gravida")}
                    {field("Parité (P)", "parity")}
                    {field("Avortements / GEU", "abortions")}
                    {field("Enfants vivants", "livingChildren")}
                    {field("Contraception", "contraception")}
                    {field(
                      "Complications obstétricales",
                      "obstetricComplications",
                    )}
                  </Grid>
                  <Add onClick={() => add("womenHealth")}>
                    Ajouter les données gynéco-obstétriques
                  </Add>
                  <Rows
                    items={value.antecedents.womenHealth}
                    label={(x) =>
                      `DDR ${x.lastMenstrualPeriod || "non renseignée"} · G${x.gravida || "—"} P${x.parity || "—"}`
                    }
                    onRemove={(i) => remove("womenHealth", i)}
                  />
                </Entry>
              </>
            )}
            {historyPage === 2 && (
              <Entry title="Allergies, intolérances et atopie">
                <Grid>
                  {field("Substance / allergène", "substance", [
                    "Pénicillines",
                    "AINS",
                    "Produit de contraste iodé",
                    "Latex",
                    "Arachide",
                  ])}
                  {field("Type", "kind", [
                    "Médicamenteuse",
                    "Alimentaire",
                    "Environnementale",
                    "Atopie",
                  ])}
                  {field("Réaction", "reaction", [
                    "Choc anaphylactique",
                    "Œdème de Quincke",
                    "Éruption cutanée",
                    "Bronchospasme",
                    "Intolérance digestive",
                  ])}
                  {field("Sévérité", "severity", [
                    "Légère",
                    "Modérée",
                    "Sévère",
                  ])}
                  {field("Précisions", "notes")}
                </Grid>
                <Add onClick={() => add("allergies", "substance")}>
                  Ajouter l’allergie / intolérance
                </Add>
                <Rows
                  items={value.antecedents.allergies}
                  label={(x) =>
                    `${x.substance || "Allergène"} · ${x.reaction || "réaction non précisée"}`
                  }
                  onRemove={(i) => remove("allergies", i)}
                />
              </Entry>
            )}
            {historyPage === 3 && (
              <Entry title="Traitements habituels et vaccinations">
                <Grid>
                  {field(
                    "Traitements habituels / automédication",
                    "longTermTreatment",
                  )}
                  {field("DCI, dosage, forme, voie", "treatmentDetails")}
                  {field("Posologie / horaires", "schedule")}
                  {field("Indication / observance", "adherence", [
                    "Bonne",
                    "Moyenne",
                    "Faible",
                  ])}
                  {field("Vaccinations / dernier rappel", "vaccinations")}
                </Grid>
                <Add onClick={() => add("habits")}>
                  Ajouter les traitements / vaccinations
                </Add>
                <Rows
                  items={value.antecedents.habits}
                  label={(x) =>
                    x.longTermTreatment ||
                    x.vaccinations ||
                    "Traitement / vaccination"
                  }
                  onRemove={(i) => remove("habits", i)}
                />
              </Entry>
            )}
            {historyPage === 4 && (
              <Entry title="Mode de vie, toxiques et environnement">
                <Grid>
                  {field("Tabac", "tobacco", [
                    "Non-fumeur",
                    "Actif",
                    "Sevré",
                    "Chicha",
                    "Cigarette électronique",
                  ])}
                  {field("Tabac · paquets-années / dates", "tobaccoDetails")}
                  {field("Alcool", "alcohol", [
                    "Abstinent",
                    "Occasionnel",
                    "Régulier",
                    "Ex-consommateur",
                  ])}
                  {field("Alcool · UAS / AUDIT-C", "alcoholDetails")}
                  {field("Drogues / autres substances", "substances")}
                  {field("Activité physique / sédentarité", "activity")}
                  {field("Alimentation / caféine", "diet")}
                </Grid>
                <Add onClick={() => add("habits")}>Ajouter les habitudes</Add>
                <Rows
                  items={value.antecedents.habits}
                  label={(x) =>
                    `Tabac : ${x.tobacco || "non renseigné"} · Alcool : ${x.alcohol || "non renseigné"}`
                  }
                  onRemove={(i) => remove("habits", i)}
                />
              </Entry>
            )}
            {historyPage === 5 && (
              <Entry title="Antécédents familiaux">
                <Grid>
                  {field("Lien de parenté", "relationship", [
                    "Père",
                    "Mère",
                    "Frère",
                    "Sœur",
                    "Enfant",
                    "Grand-parent",
                    "Oncle / tante",
                  ])}
                  {field("Statut du parent", "relativeStatus", [
                    "Vivant",
                    "Décédé",
                  ])}
                  {field("Pathologie", "pathology", [
                    "Diabète",
                    "Hypertension",
                    "Cancer",
                    "AVC",
                    "Cardiopathie",
                  ])}
                  {field("Code pathologie", "pathologyCode")}
                  {field("Âge de survenue", "onsetAge")}
                  {field("Cause du décès", "deathCause")}
                  {field("Traitement connu", "treatment")}
                </Grid>
                <Add onClick={() => add("family", "pathology")}>
                  Ajouter l’antécédent familial
                </Add>
                <Rows
                  items={value.antecedents.family}
                  label={(x) =>
                    `${x.relationship || "Parent"} · ${x.pathology || "pathologie"}`
                  }
                  onRemove={(i) => remove("family", i)}
                />
              </Entry>
            )}
            {historyPage === 6 && (
              <Entry title="Profil socio-professionnel et contexte de vie">
                <Grid>
                  {field("Profession actuelle / antérieure", "profession")}
                  {field("Expositions professionnelles", "exposures")}
                  {field("Travail de nuit / posté / stress", "workSchedule")}
                  {field("Situation familiale / aidants", "household")}
                  {field("Habitat / accès", "housing")}
                  {field("Autonomie (ADL/IADL/GIR)", "autonomy")}
                  {field("Couverture / mutuelle / ALD", "coverage")}
                </Grid>
                <Add onClick={() => add("social")}>
                  Ajouter le contexte de vie
                </Add>
                <Rows
                  items={value.antecedents.social}
                  label={(x) =>
                    `${x.profession || "Profession non renseignée"} · ${x.household || "contexte non renseigné"}`
                  }
                  onRemove={(i) => remove("social", i)}
                />
              </Entry>
            )}
            {historyPage === 7 && (
              <Entry title="Antécédents pédiatriques (si applicable)">
                <Grid>
                  {field("Poids de naissance (kg)", "birthWeightKg")}
                  {field(
                    "Terme gestationnel (semaines)",
                    "gestationalAgeWeeks",
                  )}
                  {field("Mode d’accouchement", "deliveryMode", [
                    "Voie basse",
                    "Césarienne",
                    "Instrumental",
                  ])}
                  {field("Complications néonatales", "neonatalComplications")}
                  {field("Alimentation", "feeding")}
                  {field("Vaccinations", "vaccinations")}
                  {field("Développement psychomoteur", "development")}
                </Grid>
                <Add onClick={() => add("pediatric")}>
                  Ajouter l’antécédent pédiatrique
                </Add>
                <Rows
                  items={value.antecedents.pediatric}
                  label={(x) =>
                    `Naissance ${x.birthWeightKg || "—"} kg · ${x.gestationalAgeWeeks || "—"} SA`
                  }
                  onRemove={(i) => remove("pediatric", i)}
                />
              </Entry>
            )}
          </Step>
        )}
        {step === 3 && (
          <Step
            title="Complément d’anamnèse"
            hint="Caractérisation de la plainte et revue des systèmes."
          >
            <Grid>
              <Suggest
                label="Symptôme"
                value={value.anamnesis.symptom}
                onChange={(symptom) => patch("anamnesis", { symptom })}
                suggestions={[
                  "Douleur abdominale",
                  "Céphalée",
                  "Fièvre",
                  "Toux",
                  "Dyspnée",
                ]}
              />
              <Suggest
                label="Facteur déclenchant"
                value={value.anamnesis.trigger}
                onChange={(trigger) => patch("anamnesis", { trigger })}
                suggestions={[
                  "Traumatisme",
                  "Repas gras",
                  "Effort",
                  "Prise médicamenteuse",
                  "Stress",
                ]}
              />
              <Suggest
                label="Facteurs soulageants"
                value={value.anamnesis.relievingFactors}
                onChange={(relievingFactors) =>
                  patch("anamnesis", { relievingFactors })
                }
                suggestions={[
                  "Repos",
                  "Position fœtale",
                  "Antalgique",
                  "Chaud",
                  "Froid",
                ]}
              />
              <Suggest
                label="Irradiation / trajet"
                value={value.anamnesis.irradiation}
                onChange={(irradiation) => patch("anamnesis", { irradiation })}
                suggestions={["Aucune", "Épaule droite", "Dos en ceinture"]}
              />
              <MultiChoice
                label="Types de sensation"
                value={value.anamnesis.types}
                onChange={(types) => patch("anamnesis", { types })}
                options={[
                  "Brûlure",
                  "Crampe / colique",
                  "Torsion",
                  "Pression / étau",
                  "Piqûre / poignard",
                  "Pulsatile",
                ]}
              />
              <Select
                label="Profil temporel"
                value={value.anamnesis.temporalProfile}
                onChange={(temporalProfile) =>
                  patch("anamnesis", { temporalProfile })
                }
                options={[
                  ["", "À préciser"],
                  ["CONTINU", "Continu"],
                  ["INTERMITTENT", "Intermittent / crises"],
                  ["PROGRESSIF", "Progressif"],
                  ["REGRESSIF", "Régressif"],
                ]}
              />
              <Suggest
                label="Signes généraux"
                value={value.anamnesis.generalSymptoms}
                onChange={(generalSymptoms) =>
                  patch("anamnesis", { generalSymptoms })
                }
                suggestions={[
                  "Fièvre / frissons",
                  "Asthénie",
                  "Sueurs nocturnes",
                  "Perte de poids",
                ]}
              />
              <Suggest
                label="Digestif"
                value={value.anamnesis.digestiveSymptoms}
                onChange={(digestiveSymptoms) =>
                  patch("anamnesis", { digestiveSymptoms })
                }
                suggestions={[
                  "Nausées / vomissements",
                  "Diarrhée",
                  "Constipation",
                  "Méléna / rectorragie",
                ]}
              />
              <Suggest
                label="Cardio-respiratoire"
                value={value.anamnesis.cardioRespiratorySymptoms}
                onChange={(cardioRespiratorySymptoms) =>
                  patch("anamnesis", { cardioRespiratorySymptoms })
                }
                suggestions={[
                  "Dyspnée",
                  "Palpitations",
                  "Toux",
                  "Douleur thoracique",
                ]}
              />
              <Suggest
                label="Neurologique"
                value={value.anamnesis.neurologicalSymptoms}
                onChange={(neurologicalSymptoms) =>
                  patch("anamnesis", { neurologicalSymptoms })
                }
                suggestions={[
                  "Céphalée",
                  "Vertiges",
                  "Paresthésies",
                  "Troubles visuels",
                ]}
              />
              <Select
                label="Signes d’alarme"
                value={value.anamnesis.redFlags}
                onChange={(redFlags) => patch("anamnesis", { redFlags })}
                options={[
                  ["ABSENT", "Absents"],
                  ["PRESENT", "Présents · prioritaire"],
                ]}
              />
            </Grid>
          </Step>
        )}
        {step === 4 && (
          <Step
            title="Examen physique"
            hint="Chaque famille clinique est paginée. Les constantes sont en lecture seule et l’IMC se calcule automatiquement."
          >
            <Pager
              labels={physicalPages}
              page={examPage}
              setPage={setExamPage}
            />
            {examPage === 0 && (
              <>
                <VitalCards vitals={vitalMap} bmi={bmi} />
                <Grid extra="mt-4">
                  <Select
                    label="Position de mesure"
                    value={physical("position")}
                    onChange={(v) => setPhysical("position", v)}
                    options={[
                      ["ASSIS", "Assis"],
                      ["COUCHE", "Couché"],
                      ["DEBOUT", "Debout"],
                    ]}
                  />
                  <Select
                    label="Apport O₂"
                    value={physical("oxygenSupport")}
                    onChange={(v) => setPhysical("oxygenSupport", v)}
                    options={[
                      ["AIR_AMBIANT", "Air ambiant"],
                      ["LUNETTES", "Lunettes O₂"],
                      ["MASQUE", "Masque"],
                    ]}
                  />
                  <Select
                    label="Site température"
                    value={physical("temperatureSite")}
                    onChange={(v) => setPhysical("temperatureSite", v)}
                    options={[
                      ["TYMPANIQUE", "Tympanique"],
                      ["AXILLAIRE", "Axillaire"],
                      ["RECTALE", "Rectale"],
                    ]}
                  />
                  <Text
                    label="Périmètre abdominal (cm)"
                    value={physical("abdominalCircumference")}
                    onChange={(v) => setPhysical("abdominalCircumference", v)}
                  />
                  <Text
                    label="Périmètre brachial / crânien (cm)"
                    value={physical("armCircumference")}
                    onChange={(v) => setPhysical("armCircumference", v)}
                  />
                </Grid>
              </>
            )}
            {examPage > 0 && examPage < 10 && (
              <ExamText
                title={physicalPages[examPage]}
                value={physical(
                  [
                    "",
                    "generalState",
                    "palpations",
                    "ent",
                    "cardiovascular",
                    "respiratory",
                    "abdominal",
                    "neurological",
                    "musculoskeletal",
                    "urogenital",
                  ][examPage],
                )}
                onChange={(v) =>
                  setPhysical(
                    [
                      "",
                      "generalState",
                      "palpations",
                      "ent",
                      "cardiovascular",
                      "respiratory",
                      "abdominal",
                      "neurological",
                      "musculoskeletal",
                      "urogenital",
                    ][examPage],
                    v,
                  )
                }
                suggestions={examSuggestions[examPage]}
              />
            )}{" "}
            {examPage === 10 && (
              <>
                <ExamText
                  title="Évaluation fonctionnelle, autonomie et sécurité"
                  value={physical("functionalSafety")}
                  onChange={(v) => setPhysical("functionalSafety", v)}
                  suggestions={examSuggestions[10]}
                />
                <Grid extra="mt-4">
                  <Suggest
                    label="Spécialité du médecin"
                    value={physical("specialist")}
                    onChange={(v) => setPhysical("specialist", v)}
                    suggestions={[
                      "Médecine générale",
                      "Cardiologie",
                      "Pédiatrie",
                      "Gynécologie-obstétrique",
                      "Chirurgie",
                      "Médecine interne",
                    ]}
                  />
                  <Text
                    label="Note du spécialiste"
                    value={physical("specialistNote")}
                    onChange={(v) => setPhysical("specialistNote", v)}
                    multiline
                  />
                </Grid>
                <Text
                  label="Note d’examen"
                  value={physical("notes")}
                  onChange={(v) => setPhysical("notes", v)}
                  multiline
                />
              </>
            )}
          </Step>
        )}
        {step === 5 && (
          <Step
            title="Examens complémentaires"
            hint="Les demandes sont rattachées à cette consultation et facturées selon le catalogue officiel."
          >
            {examinationsSlot || <Notice>Choisissez d’abord un patient puis enregistrez le brouillon pour créer une demande d’examen traçable.</Notice>}
          </Step>
        )}
        {step === 6 && (
          <Step
            title="Ordonnance"
            hint="La prescription utilise exclusivement le catalogue officiel ; aucun tarif n’est fourni par le navigateur."
          >
            {prescriptionSlot || <Notice>Choisissez d’abord un patient puis enregistrez le brouillon pour prescrire de façon traçable.</Notice>}
          </Step>
        )}
        {step === 7 &&
          (hasAvailableResults ? (
            <Step
              title="Orientation & synthèse"
              hint="Décision clinique après résultats."
            >
              <Grid>
                {Object.entries(value.orientation).map(([key, current]) => (
                  <Text
                    key={key}
                    label={orientationLabels[key] || key}
                    value={current}
                    onChange={(next) => patch("orientation", { [key]: next })}
                  />
                ))}
              </Grid>
            </Step>
          ) : (
            <Notice>
              Orientation verrouillée jusqu’à disponibilité d’un résultat
              d’examen pour cette consultation. Le brouillon peut être
              enregistré et les examens demandés depuis l’onglet Examens.
            </Notice>
          ))}
        {step === 8 && (
          <Step
            title="Prise en charge & suivi"
            hint="La prescription médicamenteuse est sécurisée dans l’onglet Ordonnances."
          >
            <Grid>
              <Suggest
                label="Soins non médicamenteux"
                value={value.care.nonPharma}
                onChange={(nonPharma) => patch("care", { nonPharma })}
                suggestions={[
                  "Kinésithérapie",
                  "Soins infirmiers",
                  "Suivi nutritionnel",
                  "Dispositif médical",
                ]}
              />
              <Text
                label="Objectif thérapeutique"
                value={value.care.therapeuticGoal}
                onChange={(therapeuticGoal) =>
                  patch("care", { therapeuticGoal })
                }
              />
              <Text
                label="Prochain rendez-vous / délai"
                value={value.care.nextAppointment}
                onChange={(nextAppointment) =>
                  patch("care", { nextAppointment })
                }
              />
              <Text
                label="Motif du prochain rendez-vous"
                value={value.care.appointmentReason}
                onChange={(appointmentReason) =>
                  patch("care", { appointmentReason })
                }
              />
              <Text
                label="Bilan avant prochain rendez-vous"
                value={value.care.controlTests}
                onChange={(controlTests) => patch("care", { controlTests })}
              />
              <Text
                label="Auto-mesures patient"
                value={value.care.selfMonitoring}
                onChange={(selfMonitoring) => patch("care", { selfMonitoring })}
              />
              <Text
                label="Seuils d’alerte"
                value={value.care.thresholds}
                onChange={(thresholds) => patch("care", { thresholds })}
              />
              <Text
                label="Consignes de sécurité"
                value={value.care.safetyInstructions}
                onChange={(safetyInstructions) =>
                  patch("care", { safetyInstructions })
                }
                multiline
              />
            </Grid>
          </Step>
        )}
      </div>
      <footer className="flex items-center justify-between border-t border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
        <button
          type="button"
          disabled={!step}
          onClick={() => setStep((n) => Math.max(0, n - 1))}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200"
        >
          Précédent
        </button>
        <span className="text-xs text-slate-500">
          Étape {step + 1} / {steps.length}
        </span>
        <button
          type="button"
          disabled={step === steps.length - 1}
          onClick={() => setStep((n) => Math.min(steps.length - 1, n + 1))}
          className="rounded-lg bg-aulia-teal px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          Suivant
        </button>
      </footer>
    </section>
  );
}
const examSuggestions: Record<number, string[]> = {
  1: [
    "Bon état général",
    "État altéré",
    "Faciès algique",
    "Posture antalgique",
    "Orthopnée",
  ],
  2: [
    "Pâleur",
    "Cyanose",
    "Ictère",
    "Déshydratation",
    "Purpura",
    "Adénopathie",
  ],
  3: [
    "Conjonctives pâles",
    "Sclères ictériques",
    "Isocorie",
    "Rhinorrhée",
    "Muqueuse sèche",
  ],
  4: [
    "B1/B2 réguliers",
    "Arythmie",
    "Souffle systolique",
    "Œdèmes",
    "Pouls symétriques",
  ],
  5: [
    "Thorax symétrique",
    "Tirage",
    "MV conservé",
    "Râles crépitants",
    "Sibilants",
  ],
  6: [
    "Abdomen souple",
    "Distension",
    "Défense",
    "Contracture",
    "Murphy positif",
    "BHA présents",
  ],
  7: [
    "Glasgow 15/15",
    "Orienté",
    "Déficit moteur",
    "Pupilles réactives",
    "Babinski",
  ],
  8: [
    "Pas de déformation",
    "Épanchement",
    "Chaleur locale",
    "Amplitude conservée",
    "Lasègue",
  ],
  9: [
    "Fosses lombaires indolores",
    "Giordano",
    "Examen non indiqué",
    "Examen avec consentement",
  ],
  10: [
    "Risque de chute faible",
    "Risque de chute élevé",
    "Autonome",
    "Aide partielle",
    "Dépendant",
  ],
};
const orientationLabels: Record<string, string> = {
  diagnosisType: "Type de diagnostic",
  icdCode: "Code CIM-10 / ICD-11",
  snomedCode: "Code SNOMED CT",
  diagnosisLabel: "Libellé diagnostic",
  certainty: "Degré de certitude",
  stage: "Sévérité / stade",
  disposition: "Orientation immédiate",
  destination: "Service destinataire",
  urgency: "Degré d’urgence",
  safetyNet: "Critères de redirection",
  specialistOpinion: "Avis spécialisé / RCP",
  rcp: "RCP",
  liaisonType: "Document de liaison",
  liaisonStatus: "Statut du document",
  followUp: "Suivi recommandé",
  delay: "Délai",
};
function Step({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-base font-bold text-aulia-navy dark:text-white">
          {title}
        </h4>
        <p className="mt-1 text-sm text-slate-500">{hint}</p>
      </div>
      {children}
    </div>
  );
}
function Entry({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-4 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
      <h5 className="mb-3 text-sm font-bold text-slate-800 dark:text-white">
        {title}
      </h5>
      {children}
    </section>
  );
}
function Grid({
  children,
  extra = "",
}: {
  children: React.ReactNode;
  extra?: string;
}) {
  return <div className={`grid gap-3 md:grid-cols-2 ${extra}`}>{children}</div>;
}
function Add({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-3 rounded-lg bg-aulia-navy px-3 py-2 text-xs font-bold text-white dark:bg-aulia-teal"
    >
      {children}
    </button>
  );
}
function Rows<T>({
  items,
  label,
  onRemove,
}: {
  items: T[];
  label: (item: T) => string;
  onRemove: (index: number) => void;
}) {
  return items.length ? (
    <div className="mt-3 space-y-2">
      {items.map((item, index) => (
        <div
          key={index}
          className="flex items-start justify-between gap-3 rounded-lg bg-slate-50 p-2 text-xs text-slate-700 dark:bg-slate-900 dark:text-slate-200"
        >
          <span>{label(item)}</span>
          <button
            type="button"
            onClick={() => onRemove(index)}
            className="shrink-0 font-semibold text-red-600"
          >
            Retirer
          </button>
        </div>
      ))}
    </div>
  ) : null;
}
function Pager({
  labels,
  page,
  setPage,
}: {
  labels: string[];
  page: number;
  setPage: (value: number) => void;
}) {
  return (
    <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50/70 p-2 dark:border-slate-800 dark:bg-slate-900/60">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={!page}
          onClick={() => setPage(page - 1)}
          className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-bold disabled:opacity-40 dark:border-slate-700"
        >
          ←
        </button>
        <div className="min-w-0 text-center">
          <p className="truncate text-sm font-bold text-aulia-navy dark:text-white">
            {labels[page]}
          </p>
          <p className="text-[11px] text-slate-500">
            {page + 1} / {labels.length}
          </p>
        </div>
        <button
          type="button"
          disabled={page === labels.length - 1}
          onClick={() => setPage(page + 1)}
          className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-bold disabled:opacity-40 dark:border-slate-700"
        >
          →
        </button>
      </div>
      <div className="mt-2 flex gap-1 overflow-x-auto">
        {labels.map((label, index) => (
          <button
            type="button"
            aria-label={label}
            key={label}
            onClick={() => setPage(index)}
            className={`h-1.5 min-w-6 rounded-full ${page === index ? "bg-aulia-teal" : "bg-slate-300 dark:bg-slate-700"}`}
          />
        ))}
      </div>
    </div>
  );
}
function VitalCards({
  vitals,
  bmi,
}: {
  vitals: Map<string, string>;
  bmi: string;
}) {
  const cards: Array<[string, string]> = [
    ["PA", vitals.get("BLOOD_PRESSURE") || "—"],
    ["FC", vitals.get("HEART_RATE") || "—"],
    ["FR", vitals.get("RESPIRATORY_RATE") || "—"],
    ["SpO₂", vitals.get("OXYGEN_SATURATION") || "—"],
    ["Température", vitals.get("TEMPERATURE") || "—"],
    ["Poids", vitals.get("WEIGHT") || "—"],
    ["Taille", vitals.get("HEIGHT") || "—"],
    ["IMC", bmi],
  ];
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map(([label, reading]) => (
        <div
          key={label}
          className="rounded-xl border border-aulia-teal/15 bg-aulia-mist/50 p-3 dark:bg-aulia-teal/10"
        >
          <p className="text-xs text-slate-500">{label}</p>
          <p className="mt-1 font-bold text-aulia-navy dark:text-white">
            {reading}
          </p>
        </div>
      ))}
    </div>
  );
}
function ExamText({
  title,
  value,
  onChange,
  suggestions = [],
}: {
  title: string;
  value: string;
  onChange: (value: string) => void;
  suggestions?: string[];
}) {
  return (
    <Entry title={title}>
      <Suggest
        label="Constats et précisions"
        value={value}
        onChange={onChange}
        suggestions={suggestions}
      />
    </Entry>
  );
}
function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
      {children}
    </div>
  );
}
function Text({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  multiline,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  multiline?: boolean;
  disabled?: boolean;
}) {
  const css =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-aulia-teal disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:disabled:bg-slate-800";
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">
        {label}
      </span>
      {multiline ? (
        <textarea
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className={css}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className={css}
        />
      )}
    </label>
  );
}
function Select({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
  disabled?: boolean;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-aulia-teal disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:disabled:bg-slate-800"
      >
        {options.map(([key, name]) => (
          <option key={key} value={key}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}
function Suggest({
  label,
  value,
  onChange,
  suggestions,
  type,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  type?: string;
}) {
  return (
    <div>
      <Text label={label} value={value} onChange={onChange} type={type} />
      {suggestions.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {suggestions.map((item) => (
            <button
              type="button"
              key={item}
              onClick={() =>
                onChange(
                  value
                    ? `${value}${value.includes(item) ? "" : `, ${item}`}`
                    : item,
                )
              }
              className="rounded-full border border-aulia-teal/25 px-2 py-1 text-[11px] font-medium text-aulia-teal hover:bg-aulia-mist dark:hover:bg-aulia-teal/15"
            >
              {item}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
function MultiChoice({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  const selected = value
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  const toggle = (option: string) =>
    onChange(
      selected.includes(option)
        ? selected.filter((x) => x !== option).join(", ")
        : [...selected, option].join(", "),
    );
  return (
    <div>
      <p className="mb-1 text-sm font-medium text-slate-600 dark:text-slate-300">
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <button
            type="button"
            key={option}
            onClick={() => toggle(option)}
            className={`rounded-full border px-2 py-1 text-[11px] font-medium ${selected.includes(option) ? "border-aulia-teal bg-aulia-teal text-white" : "border-aulia-teal/25 text-aulia-teal"}`}
          >
            {option}
          </button>
        ))}
      </div>
      <Text label="Autre type / précision" value={value} onChange={onChange} />
    </div>
  );
}
