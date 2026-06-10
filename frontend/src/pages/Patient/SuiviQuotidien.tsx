import { useMemo, useState } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { CheckCircleIcon, CloseIcon } from "../../icons";

const periods = ["Matin", "Après-midi", "Soir"];
const symptomNames = ["Douleur", "Fatigue", "Nausée", "Fièvre", "Vertige", "Toux", "Respiration"];
const severityOptions = ["Absent", "Faible", "Modéré", "Important"];

const SuiviQuotidien = () => {
  const [selectedPeriod, setSelectedPeriod] = useState("Matin");
  const [symptoms, setSymptoms] = useState<Record<string, string>>(
    symptomNames.reduce((acc, symptom) => ({ ...acc, [symptom]: "Absent" }), {})
  );
  const [treatments, setTreatments] = useState({ matin: true, midi: true, soir: false });
  const [painLevel, setPainLevel] = useState(3);
  const [sleepHours] = useState("7h42");
  const [sleepQuality] = useState("Bonne");
  const [hydration] = useState("Correcte");
  const [activity] = useState("Marche légère effectuée");
  const [activityTime] = useState("15 min");
  const [vitals] = useState({ temperature: "36.8°C", tension: "12/8", pulse: "79 bpm" });
  const [showAlert] = useState(true);

  const filteredTimeline = useMemo(
    () => [
      { time: "08h00", event: "Médicament confirmé", period: "Matin" },
      { time: "10h14", event: "Symptôme déclaré : fatigue légère", period: "Matin" },
      { time: "14h00", event: "Hydratation validée", period: "Après-midi" },
      { time: "18h30", event: "Recommandation IA envoyée", period: "Soir" },
    ].filter((item) => item.period === selectedPeriod),
    [selectedPeriod]
  );

  const statusColor = useMemo(() => {
    if (Object.values(symptoms).includes("Important") || !treatments.soir) return "red";
    if (Object.values(symptoms).includes("Modéré") || painLevel > 5) return "orange";
    return "green";
  }, [symptoms, painLevel, treatments.soir]);

  const statusLabel = statusColor === "green" ? "Stable" : statusColor === "orange" ? "Surveillé" : "Alerte";

  const iaSummary =
    statusColor === "green"
      ? "Votre récupération semble normale aujourd’hui. Continuez votre traitement et reposez-vous suffisamment."
      : statusColor === "orange"
      ? "Quelques symptômes demandent attention. Respectez vos traitements et restez hydraté."
      : "Une anomalie a été détectée. Contactez rapidement votre médecin si la situation persiste.";

  const objectives = [
    { label: "Prendre tous les traitements", done: treatments.matin && treatments.midi && treatments.soir },
    { label: "Marcher 10 minutes", done: activityTime !== "0 min" },
    { label: "Hydratation correcte", done: hydration === "Correcte" },
  ];

  return (
    <div>
      <PageMeta title="Suivi quotidien | D7 Clinique" description="Suivi quotidien du patient avec état, symptômes, traitements, IA et timeline." />
      <PageBreadcrumb pageTitle="Suivi quotidien" />

      <div className="min-h-screen rounded-2xl border border-gray-200 bg-white px-5 py-7 dark:border-gray-800 dark:bg-white/[0.03] xl:px-10 xl:py-12">
        <div className="grid gap-6 xl:grid-cols-[1.25fr_0.85fr]">
          <div className="space-y-6">
            <div className="rounded-3xl border border-gray-200 bg-slate-50 p-6 dark:border-gray-800 dark:bg-slate-950">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h1 className="mt-3 text-2xl font-semibold text-gray-900 dark:text-white">Suivi de votre état de santé</h1>
                </div>
                <div className="flex flex-wrap gap-2">
                  {periods.map((period) => (
                    <button
                      key={period}
                      onClick={() => setSelectedPeriod(period)}
                      className={`rounded-2xl border px-4 py-2 text-sm transition ${
                        selectedPeriod === period
                          ? "border-blue-600 bg-blue-600 text-white"
                          : "border-gray-200 bg-white text-gray-700 hover:border-blue-300 hover:bg-blue-50 dark:border-gray-700 dark:bg-slate-900 dark:text-gray-200"
                      }`}
                    >
                      {period}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-6 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
                <div className="rounded-3xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-slate-950">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">État aujourd’hui</p>
                      <h2 className="mt-2 text-3xl font-semibold text-gray-900 dark:text-white">{statusLabel}</h2>
                    </div>
                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${
                        statusColor === "green"
                          ? "bg-emerald-100 text-emerald-700"
                          : statusColor === "orange"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {statusColor === "green" ? "Vert" : statusColor === "orange" ? "Orange" : "Rouge"}
                    </span>
                  </div>
                  <div className="mt-6 rounded-3xl bg-slate-50 p-4 text-sm text-gray-700 dark:bg-slate-900 dark:text-gray-200">
                    <p className="font-semibold text-gray-900 dark:text-white">Résumé IA</p>
                    <p className="mt-3 leading-7">{iaSummary}</p>
                  </div>
                </div>

                <div className="rounded-3xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-slate-950">
                  <p className="text-sm uppercase tracking-[0.25em] text-gray-500 dark:text-gray-400">Analyse IA</p>
                  <div className="mt-4 rounded-3xl bg-slate-50 p-4 text-sm text-gray-700 dark:bg-slate-900 dark:text-gray-200">
                    <p className="font-semibold text-gray-900 dark:text-white">Assistant IA D7</p>
                    <p className="mt-3">Comment vous sentez-vous aujourd’hui ?</p>
                    <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Votre programme quotidien est prêt. Suivez vos symptômes, confirmez vos traitements et gardez un œil sur votre évolution.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.25fr_0.85fr]">
              <div className="space-y-6">
                <section className="rounded-3xl border border-gray-200 bg-slate-50 p-6 dark:border-gray-800 dark:bg-slate-950">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="text-sm uppercase tracking-[0.25em] text-gray-500 dark:text-gray-400">Symptômes du jour</p>
                      <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">Déclarez votre ressenti par symptôme.</p>
                    </div>
                    <span className="text-sm text-gray-500 dark:text-gray-400">Filter: {selectedPeriod}</span>
                  </div>
                  <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    {symptomNames.map((symptom) => (
                      <div key={symptom} className="rounded-3xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-slate-900">
                        <p className="font-semibold text-gray-900 dark:text-white">{symptom}</p>
                        <div className="mt-4 grid grid-cols-2 gap-2">
                          {severityOptions.map((level) => (
                            <button
                              key={level}
                              onClick={() => setSymptoms((prev) => ({ ...prev, [symptom]: level }))}
                              className={`rounded-2xl border px-3 py-2 text-sm text-left transition ${
                                symptoms[symptom] === level
                                  ? "border-blue-600 bg-blue-600 text-white"
                                  : "border-gray-200 bg-white text-gray-700 hover:border-blue-200 dark:border-gray-700 dark:bg-slate-950 dark:text-gray-200"
                              }`}
                            >
                              {level}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-3xl border border-gray-200 bg-slate-50 p-6 dark:border-gray-800 dark:bg-slate-950">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="text-sm uppercase tracking-[0.25em] text-gray-500 dark:text-gray-400">Confirmation médicaments</p>
                      <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">Cochez les prises effectuées aujourd'hui.</p>
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-2 text-sm text-green-700 dark:bg-emerald-950/40 dark:text-emerald-200">
                      <CheckCircleIcon className="h-4 w-4" /> IA détecte les anomalies
                    </div>
                  </div>
                  <div className="mt-6 space-y-4">
                    {[
                      { label: "Médicament du matin pris", key: "matin" },
                      { label: "Médicament de midi pris", key: "midi" },
                      { label: "Médicament du soir", key: "soir" },
                    ].map((item) => (
                      <label key={item.key} className="flex cursor-pointer items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 transition hover:border-blue-300 dark:border-gray-800 dark:bg-slate-900 dark:text-gray-200">
                        <input
                          type="checkbox"
                          checked={treatments[item.key as keyof typeof treatments]}
                          onChange={() => setTreatments((prev) => ({ ...prev, [item.key]: !prev[item.key as keyof typeof treatments] }))}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        {item.label}
                      </label>
                    ))}
                  </div>
                  <div className="mt-4 rounded-3xl bg-orange-50 p-4 text-sm text-orange-800 dark:bg-orange-950/30 dark:text-orange-200">
                    <p className="font-semibold">IA : Vous avez oublié une prise hier soir.</p>
                    <p className="mt-2">Rappel : prenez votre traitement du soir avec de l'eau et notez votre suivi.</p>
                  </div>
                </section>

                <section className="rounded-3xl border border-gray-200 bg-slate-50 p-6 dark:border-gray-800 dark:bg-slate-950">
                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="rounded-3xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-slate-900">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">Niveau de douleur</p>
                          <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">{painLevel}/10</p>
                        </div>
                        <span className="rounded-2xl bg-red-100 px-3 py-1 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-200">Sensible</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={10}
                        value={painLevel}
                        onChange={(e) => setPainLevel(Number(e.target.value))}
                        className="mt-6 w-full"
                      />
                    </div>
                    <div className="rounded-3xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-slate-900">
                      <p className="text-sm uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">Sommeil</p>
                      <p className="mt-2 text-3xl font-semibold text-gray-900 dark:text-white">{sleepHours}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Qualité : {sleepQuality}</p>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-6 md:grid-cols-2">
                    <div className="rounded-3xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-slate-900">
                      <p className="text-sm uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">Hydratation</p>
                      <p className="mt-3 text-2xl font-semibold text-gray-900 dark:text-white">{hydration}</p>
                    </div>
                    <div className="rounded-3xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-slate-900">
                      <p className="text-sm uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">Activité physique</p>
                      <p className="mt-3 text-2xl font-semibold text-gray-900 dark:text-white">{activity}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{activityTime}</p>
                    </div>
                  </div>
                </section>
              </div>

              <aside className="space-y-6">
                <div className="rounded-3xl border border-gray-200 bg-slate-50 p-6 dark:border-gray-800 dark:bg-slate-950">
                  <p className="text-sm uppercase tracking-[0.25em] text-gray-500 dark:text-gray-400">Constantes</p>
                  <div className="mt-6 space-y-4">
                    {Object.entries(vitals).map(([key, value]) => (
                      <div key={key} className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 dark:border-gray-800 dark:bg-slate-900 dark:text-gray-200">
                        <span>{key.charAt(0).toUpperCase() + key.slice(1)}</span>
                        <span className="font-semibold text-gray-900 dark:text-white">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-3xl border border-gray-200 bg-slate-50 p-6 dark:border-gray-800 dark:bg-slate-950">
                  <p className="text-sm uppercase tracking-[0.25em] text-gray-500 dark:text-gray-400">Objectifs du jour</p>
                  <ul className="mt-6 space-y-3">
                    {objectives.map((item) => (
                      <li key={item.label} className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm dark:border-gray-800 dark:bg-slate-900">
                        <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full ${item.done ? "bg-green-600 text-white" : "bg-gray-200 text-gray-500 dark:bg-slate-800 dark:text-gray-300"}`}>
                          {item.done ? <CheckCircleIcon className="h-4 w-4" /> : <CloseIcon className="h-4 w-4" />}
                        </span>
                        <span>{item.label}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </aside>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-3xl border border-gray-200 bg-slate-50 p-6 dark:border-gray-800 dark:bg-slate-950">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm uppercase tracking-[0.25em] text-gray-500 dark:text-gray-400">Alerts médicales</p>
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">Suivi automatique par IA.</p>
                </div>
                <span className="rounded-full bg-red-100 px-3 py-1 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-200">Important</span>
              </div>
              {showAlert && (
                <div className="mt-6 rounded-3xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-200">
                  <p className="font-semibold">Une douleur persistante a été détectée.</p>
                  <p className="mt-2">Veuillez contacter votre médecin si vous ressentez toujours une gêne après le traitement.</p>
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-gray-200 bg-slate-50 p-6 dark:border-gray-800 dark:bg-slate-950">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm uppercase tracking-[0.25em] text-gray-500 dark:text-gray-400">Timeline quotidienne</p>
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">Historique des actions et événements.</p>
                </div>
                <span className="text-sm text-gray-500 dark:text-gray-400">{selectedPeriod}</span>
              </div>
              <div className="mt-6 space-y-4">
                {filteredTimeline.map((item) => (
                  <div key={item.time} className="rounded-3xl border border-gray-200 bg-white px-4 py-4 text-sm text-gray-700 dark:border-gray-800 dark:bg-slate-900 dark:text-gray-200">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-gray-900 dark:text-white">{item.time}</span>
                      <span className="text-xs uppercase tracking-[0.25em] text-gray-500 dark:text-gray-400">{item.period}</span>
                    </div>
                    <p className="mt-2">{item.event}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-gray-200 bg-slate-50 p-6 dark:border-gray-800 dark:bg-slate-950">
              <p className="text-sm uppercase tracking-[0.25em] text-gray-500 dark:text-gray-400">Évolution graphique</p>
              <div className="mt-6 space-y-4">
                {[
                  { name: "Douleur", value: painLevel * 10 },
                  { name: "Sommeil", value: 78 },
                  { name: "Température", value: 68 },
                  { name: "Récupération", value: 85 },
                  { name: "Régularité traitement", value: treatments.matin && treatments.midi && treatments.soir ? 100 : 70 },
                ].map((item) => (
                  <div key={item.name}>
                    <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
                      <span>{item.name}</span>
                      <span>{item.value}%</span>
                    </div>
                    <div className="mt-2 h-3 overflow-hidden rounded-full bg-gray-200 dark:bg-slate-900">
                      <div className="h-full rounded-full bg-blue-600" style={{ width: `${item.value}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SuiviQuotidien;
