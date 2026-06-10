import { useMemo, useState } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { CheckCircleIcon, AlertIcon } from "../../icons";

const treatmentData = [
  {
    id: 1,
    name: "Paracétamol",
    dosage: "500mg",
    quantity: "1 comprimé",
    frequency: "3 fois/jour",
    times: ["08h00", "14h00", "20h00"],
    daysLeft: 5,
    status: "Pris",
    progress: 72,
    instructions: "À prendre après le repas.",
    sideEffects: "Fatigue légère, somnolence.",
    priority: "Important",
    history: [
      { time: "08h03", status: "Confirmé" },
      { time: "14h01", status: "Confirmé" },
      { time: "20h00", status: "En attente" },
    ],
  },
  {
    id: 2,
    name: "Amoxicilline",
    dosage: "250mg",
    quantity: "2 comprimés",
    frequency: "2 fois/jour",
    times: ["09h00", "18h00"],
    daysLeft: 7,
    status: "Oublié",
    progress: 55,
    instructions: "Évitez de vous allonger immédiatement après la prise.",
    sideEffects: "Nausée possible, réactions allergiques rares.",
    priority: "Surveillance renforcée",
    history: [
      { time: "09h15", status: "Confirmé" },
      { time: "18h00", status: "Oublié" },
    ],
  },
  {
    id: 3,
    name: "Ibuprofène",
    dosage: "200mg",
    quantity: "1 comprimé",
    frequency: "Selon besoin",
    times: ["À la demande"],
    daysLeft: 10,
    status: "En attente",
    progress: 45,
    instructions: "Prendre avec de l'eau et un peu de nourriture.",
    sideEffects: "Troubles digestifs possibles.",
    priority: "Standard",
    history: [
      { time: "10h30", status: "Confirmé" },
    ],
  },
];

const MesTraitements = () => {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [statuses, setStatuses] = useState<Record<number, string>>(
    treatmentData.reduce((acc, t) => ({ ...acc, [t.id]: t.status }), {})
  );

  const upcomingReminder = useMemo(() => {
    return "Votre traitement de 14h00 approche (Paracétamol).";
  }, []);

  const aiAlerts = [
    "Deux oublis consécutifs détectés cette semaine.",
    "Vous prenez régulièrement vos médicaments le matin. Bien!",
  ];

  return (
    <div>
      <PageMeta title="Mes Traitements | D7 Clinique" description="Suivi des traitements actuels avec détails, horaires, et historique de prise." />
      <PageBreadcrumb pageTitle="Mes Traitements" />

      <div className="min-h-screen rounded-2xl border border-gray-200 bg-white px-5 py-7 dark:border-gray-800 dark:bg-white/[0.03] xl:px-10 xl:py-12">
        {/* Rappel IA */}
        <div className="mb-6 rounded-3xl border border-blue-200 bg-blue-50 p-5 dark:border-blue-900/30 dark:bg-blue-950/20">
          <div className="flex items-start gap-3">
            <div className="mt-1 inline-flex items-center justify-center rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold text-white">
              IA
            </div>
            <div>
              <p className="font-semibold text-blue-900 dark:text-blue-100">{upcomingReminder}</p>
              <p className="mt-2 text-sm text-blue-800 dark:text-blue-200">Confirmez votre prise pour un suivi optimal.</p>
            </div>
          </div>
        </div>

        {/* Alertes IA */}
        <div className="mb-6 space-y-3">
          {aiAlerts.map((alert, idx) => (
            <div key={idx} className="rounded-3xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800 dark:border-orange-900/30 dark:bg-orange-950/20 dark:text-orange-200">
              <div className="flex items-start gap-3">
                <AlertIcon className="mt-0.5 h-5 w-5 flex-shrink-0" />
                <span>{alert}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Liste des traitements */}
        <div className="grid gap-6">
          {treatmentData.map((treatment) => (
            <div key={treatment.id} className="rounded-3xl border border-gray-200 bg-slate-50 p-6 dark:border-gray-800 dark:bg-slate-950">
              {/* Header */}
              <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">{treatment.name}</h2>
                    <span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-200">
                      {treatment.dosage}
                    </span>
                    <span
                      className={`rounded-full px-3 py-1 text-sm font-semibold ${
                        treatment.priority === "Important"
                          ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-200"
                          : treatment.priority === "Surveillance renforcée"
                          ? "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-200"
                          : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200"
                      }`}
                    >
                      {treatment.priority}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
                    {treatment.quantity} • {treatment.frequency}
                  </p>
                </div>

                {/* État et Badge */}
                <div className="flex flex-col items-end gap-2">
                  <div
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold ${
                      statuses[treatment.id] === "Pris"
                        ? "bg-green-100 text-green-700 dark:bg-emerald-950/40 dark:text-emerald-200"
                        : statuses[treatment.id] === "En attente"
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
                        : "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-200"
                    }`}
                  >
                    {statuses[treatment.id] === "Pris" ? (
                      <CheckCircleIcon className="h-4 w-4" />
                    ) : statuses[treatment.id] === "En attente" ? (
                      <span className="h-4 w-4 text-lg">⏳</span>
                    ) : (
                      <AlertIcon className="h-4 w-4" />
                    )}
                    {statuses[treatment.id]}
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">{treatment.daysLeft} jours restants</span>
                </div>
              </div>

              {/* Horaires */}
              <div className="mt-6 rounded-3xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-slate-900">
                <p className="text-sm uppercase tracking-[0.25em] text-gray-500 dark:text-gray-400">Horaires de prise</p>
                <div className="mt-3 flex flex-wrap gap-3">
                  {treatment.times.map((time) => (
                    <span key={time} className="inline-block rounded-2xl bg-blue-100 px-4 py-2 font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-200">
                      {time}
                    </span>
                  ))}
                </div>
              </div>

              {/* Progression */}
              <div className="mt-6 rounded-3xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-slate-900">
                <div className="flex items-center justify-between gap-4 text-sm">
                  <span className="uppercase tracking-[0.25em] text-gray-500 dark:text-gray-400">Progression traitement</span>
                  <span className="font-semibold text-gray-900 dark:text-white">{treatment.progress}%</span>
                </div>
                <div className="mt-3 h-3 overflow-hidden rounded-full bg-gray-200 dark:bg-slate-800">
                  <div className="h-full rounded-full bg-blue-600" style={{ width: `${treatment.progress}%` }} />
                </div>
              </div>

              {/* Détails supplémentaires */}
              <button
                onClick={() => setExpandedId(expandedId === treatment.id ? null : treatment.id)}
                className="mt-6 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-left font-semibold text-gray-700 transition hover:border-blue-300 hover:bg-blue-50 dark:border-gray-800 dark:bg-slate-900 dark:text-gray-200 dark:hover:border-blue-500/40 dark:hover:bg-slate-950"
              >
                {expandedId === treatment.id ? "Masquer les détails" : "Voir les détails"}
              </button>

              {expandedId === treatment.id && (
                <div className="mt-6 space-y-4 border-t border-gray-200 pt-6 dark:border-gray-800">
                  {/* Instructions */}
                  <div className="rounded-3xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-slate-900">
                    <p className="text-sm uppercase tracking-[0.25em] text-gray-500 dark:text-gray-400">Instructions médicales</p>
                    <p className="mt-3 text-sm text-gray-700 dark:text-gray-200">{treatment.instructions}</p>
                  </div>

                  {/* Effets secondaires */}
                  <div className="rounded-3xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-slate-900">
                    <p className="text-sm uppercase tracking-[0.25em] text-gray-500 dark:text-gray-400">Effets possibles</p>
                    <p className="mt-3 text-sm text-gray-700 dark:text-gray-200">{treatment.sideEffects}</p>
                  </div>

                  {/* Historique mini timeline */}
                  <div className="rounded-3xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-slate-900">
                    <p className="text-sm uppercase tracking-[0.25em] text-gray-500 dark:text-gray-400">Historique des prises</p>
                    <div className="mt-4 space-y-2">
                      {treatment.history.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between text-sm">
                          <span className="font-semibold text-gray-900 dark:text-white">{item.time}</span>
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${
                              item.status === "Confirmé"
                                ? "bg-green-100 text-green-700 dark:bg-emerald-950/40 dark:text-emerald-200"
                                : "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
                            }`}
                          >
                            {item.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Bouton Confirmation */}
              {statuses[treatment.id] !== "Pris" && (
                <button
                  onClick={() => setStatuses((prev) => ({ ...prev, [treatment.id]: "Pris" }))}
                  className="mt-6 w-full rounded-3xl bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-700"
                >
                  ✓ Confirmer la prise
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default MesTraitements;
