import { useState } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";

const urgentAlerts = [
  {
    patient: "Mme Mbombo",
    issue: "Saturation 82%",
    room: "422B",
    doctor: "Dr Ngoma",
    action: "Intervenir",
  },
  {
    patient: "Mr Kalala",
    issue: "Douleur thoracique",
    room: "310A",
    doctor: "Dr Mbala",
    action: "Notifier médecin",
  },
  {
    patient: "Mme Kayi",
    issue: "Appel médecin en attente",
    room: "205C",
    doctor: "Dr Kim",
    action: "Intervenir",
  },
  {
    patient: "Mr Bemba",
    issue: "Alarmes cardiaques actives",
    room: "118A",
    doctor: "Dr Ngoma",
    action: "Intervenir",
  },
];

const assignedPatients = [
  {
    name: "Mme Mbombo",
    room: "422B",
    status: "Critique",
    nextCare: "Oxygénothérapie à 09:15",
    lastNote: "Saturation basse après changement de position.",
  },
  {
    name: "Mr Kalala",
    room: "310A",
    status: "Surveillé",
    nextCare: "ECG de contrôle à 10:00",
    lastNote: "Douleur thoracique atténuée avec nitro.",
  },
  {
    name: "Mme Kayi",
    room: "205C",
    status: "Stable",
    nextCare: "Prise de constantes à 09:30",
    lastNote: "Tension stable, perfusion en cours.",
  },
];

const careTasks = [
  { time: "08:30", task: "Injection Insuline", status: "À faire" },
  { time: "09:00", task: "Prise de constantes Mr Kalala", status: "En retard" },
  { time: "09:15", task: "Oxygénothérapie Mme Mbombo", status: "À faire" },
  { time: "10:00", task: "Pansement abdo Mme Kayi", status: "À faire" },
  { time: "10:30", task: "Préparation perfusion Mr Bemba", status: "En cours" },
];

const vitalsOverview = {
  activePatients: 8,
  abnormalValues: 5,
  criticalTrends: "Fièvre en hausse sur 2 cas",
};

type MedicationItem = {
  medication: string;
  patient: string;
  due: string;
  status: string;
  done: boolean;
};

type RoundItem = {
  time: string;
  location: string;
  note: string;
  done: boolean;
};

const initialMedicationQueue: MedicationItem[] = [
  { medication: "Morphine 5mg", patient: "Mr Kalala", due: "09:10", status: "À faire", done: false },
  { medication: "Amoxicilline IV", patient: "Mme Kayi", due: "09:45", status: "Validation en attente", done: false },
  { medication: "Heparine SC", patient: "Mr Bemba", due: "10:00", status: "À faire", done: false },
];

const initialRoundsPlan: RoundItem[] = [
  { time: "09:00", location: "205C", note: "Contrôle perfusion", done: false },
  { time: "09:30", location: "310A", note: "ECG + observ.", done: false },
  { time: "10:15", location: "422B", note: "Saturation + gaz", done: false },
  { time: "11:00", location: "118A", note: "Revue alarme cardiaque", done: false },
];

const medicalMessages = [
  { from: "Dr Ngoma", subject: "Révision traitement cholesterol", time: "08:12" },
  { from: "Dr Mbala", subject: "Nouvelle prescription antibiotique", time: "08:45" },
  { from: "Dr Kim", subject: "Demande de prélèvement sanguin", time: "09:05" },
];

const workloadSummary = {
  remainingTasks: 12,
  criticalPatients: 3,
  activeEmergencies: 4,
};

const statusLabelStyles: Record<string, string> = {
  Critique: "bg-red-100 text-red-700",
  Surveillé: "bg-amber-100 text-amber-700",
  Stable: "bg-emerald-100 text-emerald-700",
  "À faire": "bg-slate-100 text-slate-700",
  "En cours": "bg-sky-100 text-sky-700",
  "En retard": "bg-red-100 text-red-700",
  "Validation en attente": "bg-amber-100 text-amber-700",
};

type AlertState = {
  notified: boolean;
  seen: boolean;
  intervened: boolean;
};

export default function DashboardInfirmier() {
  const [alertStates, setAlertStates] = useState<Record<string, AlertState>>({});
  const [selectedNotifyAlert, setSelectedNotifyAlert] = useState<null | (typeof urgentAlerts)[number]>(null);
  const [medicationQueueState, setMedicationQueueState] = useState<MedicationItem[]>(initialMedicationQueue);
  const [roundsPlanState, setRoundsPlanState] = useState<RoundItem[]>(initialRoundsPlan);

  const getAlertState = (patient: string): AlertState =>
    alertStates[patient] ?? { notified: false, seen: false, intervened: false };

  const toggleMedicationDone = (medication: string, patient: string) => {
    setMedicationQueueState((prev) =>
      prev.map((item) =>
        item.medication === medication && item.patient === patient
          ? { ...item, done: !item.done }
          : item
      )
    );
  };

  const toggleRoundDone = (time: string, location: string) => {
    setRoundsPlanState((prev) =>
      prev.map((item) =>
        item.time === time && item.location === location
          ? { ...item, done: !item.done }
          : item
      )
    );
  };

  const toggleIntervention = (patient: string) => {
    setAlertStates((prev) => {
      const current = prev[patient] ?? { notified: false, seen: false, intervened: false };
      return {
        ...prev,
        [patient]: { ...current, intervened: !current.intervened },
      };
    });
  };

  const notifyDoctor = () => {
    if (!selectedNotifyAlert) return;
    setAlertStates((prev) => {
      const current = prev[selectedNotifyAlert.patient] ?? { notified: false, seen: false, intervened: false };
      return {
        ...prev,
        [selectedNotifyAlert.patient]: { ...current, notified: true },
      };
    });
  };

  const markSeen = () => {
    if (!selectedNotifyAlert) return;
    setAlertStates((prev) => {
      const current = prev[selectedNotifyAlert.patient] ?? { notified: false, seen: false, intervened: false };
      return {
        ...prev,
        [selectedNotifyAlert.patient]: { ...current, seen: true },
      };
    });
  };

  const closeNotifyModal = () => setSelectedNotifyAlert(null);
  return (
    <div className="p-4 sm:p-6 bg-slate-50 dark:bg-slate-950 min-h-screen">
      <PageMeta
        title="Dashboard infirmier | D7 Clinique"
        description="Tableau de bord des soins infirmiers pour gérer urgences, tâches, patients et surveillance vitale."
      />
      <PageBreadcrumb pageTitle="Dashboard soins infirmiers" />

      <div className="grid gap-6 xl:grid-cols-[1.7fr_1fr]">
        <div className="space-y-6">
          <section className="rounded-3xl border border-red-200 bg-red-50 p-5 shadow-sm dark:border-red-800 dark:bg-red-900/10">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-700 dark:text-red-300">Urgences actives</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">Priorité absolue</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="rounded-2xl bg-red-700 px-4 py-2 text-sm font-semibold text-white">Intervenir</button>
                <button className="rounded-2xl border border-red-700 bg-white px-4 py-2 text-sm font-semibold text-red-700">Notifier médecin</button>
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {urgentAlerts.map((alert) => {
                const state = getAlertState(alert.patient);
                return (
                  <div key={alert.patient} className="rounded-3xl border border-red-200 bg-white p-4 shadow-sm dark:border-red-700 dark:bg-slate-950">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">{alert.patient} • {alert.room}</p>
                        <p className="mt-1 text-sm text-red-700 dark:text-red-300">{alert.issue}</p>
                      </div>
                      <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700 dark:bg-red-900/60 dark:text-red-200">{alert.action}</span>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {alert.action === "Notifier médecin" ? (
                        <button
                          onClick={() => setSelectedNotifyAlert(alert)}
                          className="rounded-2xl bg-red-700 px-4 py-2 text-sm font-semibold text-white"
                        >
                          Notifier médecin
                        </button>
                      ) : (
                        <button
                          onClick={() => toggleIntervention(alert.patient)}
                          className={`rounded-2xl px-4 py-2 text-sm font-semibold ${state.intervened ? "bg-emerald-700 text-white" : "bg-red-700 text-white"}`}
                        >
                          {state.intervened ? "Intervenu" : "Intervenir"}
                        </button>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
                      {alert.action === "Notifier médecin" ? (
                        <>
                          <span className="rounded-full bg-slate-100 px-2 py-1 dark:bg-slate-800">Notifié : {state.notified ? "Oui" : "Non"}</span>
                          <span className="rounded-full bg-slate-100 px-2 py-1 dark:bg-slate-800">Vu : {state.seen ? "Oui" : "Non"}</span>
                        </>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-1 dark:bg-slate-800">Intervenu : {state.intervened ? "Oui" : "Non"}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Patients assignés aujourd’hui</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">Le cœur du travail</h2>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">Triage par gravité</span>
            </div>
            <div className="space-y-3">
              {assignedPatients.map((patient) => (
                <div key={patient.name} className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white">{patient.name} • {patient.room}</p>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{patient.nextCare}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusLabelStyles[patient.status]}`}>{patient.status}</span>
                  </div>
                  <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">Dernière observation : {patient.lastNote}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Tâches infirmières du jour</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">Liste opérationnelle</h2>
              </div>
            </div>
            <div className="space-y-3">
              {careTasks.map((task) => (
                <div key={`${task.time}-${task.task}`} className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white">{task.task}</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">Prévue à {task.time}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusLabelStyles[task.status]}`}>{task.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Surveillance vitale rapide</p>
            <h2 className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">Overview utile</h2>
            <div className="mt-5 grid gap-3">
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
                <p className="text-sm text-slate-500 dark:text-slate-400">Patients sous surveillance active</p>
                <p className="mt-2 text-3xl font-semibold text-slate-900 dark:text-white">{vitalsOverview.activePatients}</p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
                <p className="text-sm text-slate-500 dark:text-slate-400">Constantes anormales</p>
                <p className="mt-2 text-3xl font-semibold text-slate-900 dark:text-white">{vitalsOverview.abnormalValues}</p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
                <p className="text-sm text-slate-500 dark:text-slate-400">Tendances critiques</p>
                <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">{vitalsOverview.criticalTrends}</p>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Médicaments & administrations</p>
            <h2 className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">En attente</h2>
            <div className="mt-5 space-y-3">
              {medicationQueueState.map((item) => (
                <div key={`${item.medication}-${item.patient}`} className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white">{item.medication}</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">{item.patient} • {item.due}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${item.done ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"}`}>
                        {item.done ? "Fait" : "En attente"}
                      </span>
                      <button
                        onClick={() => toggleMedicationDone(item.medication, item.patient)}
                        className={`rounded-2xl px-3 py-1 text-xs font-semibold ${item.done ? "bg-slate-300 text-slate-700" : "bg-slate-900 text-white"}`}
                      >
                        {item.done ? "Annuler" : "Marquer fait"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Tour de service</p>
            <h2 className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">Planning immédiat</h2>
            <div className="mt-5 space-y-3">
              {roundsPlanState.map((round) => (
                <div key={`${round.time}-${round.location}`} className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white">{round.time} — {round.location}</p>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{round.note}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${round.done ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"}`}>
                        {round.done ? "Fait" : "À faire"}
                      </span>
                      <button
                        onClick={() => toggleRoundDone(round.time, round.location)}
                        className={`rounded-2xl px-3 py-1 text-xs font-semibold ${round.done ? "bg-slate-300 text-slate-700" : "bg-slate-900 text-white"}`}
                      >
                        {round.done ? "Annuler" : "Marquer fait"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div className="grid gap-6 xl:grid-cols-2">
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Messages médicaux récents</p>
              <h2 className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">Communication médecin</h2>
              <div className="mt-5 space-y-3">
                {medicalMessages.map((msg) => (
                  <div key={`${msg.from}-${msg.time}`} className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
                    <p className="font-semibold text-slate-900 dark:text-white">{msg.subject}</p>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{msg.from} • {msg.time}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Résumé de charge</p>
              <h2 className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">Pression du service</h2>
              <div className="mt-5 space-y-3">
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
                  <p className="text-sm text-slate-500 dark:text-slate-400">Tâches restantes</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{workloadSummary.remainingTasks}</p>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
                  <p className="text-sm text-slate-500 dark:text-slate-400">Patients critiques</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{workloadSummary.criticalPatients}</p>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
                  <p className="text-sm text-slate-500 dark:text-slate-400">Urgences ouvertes</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{workloadSummary.activeEmergencies}</p>
                </div>
              </div>
            </section>
          </div>
        </aside>
      </div>

      {selectedNotifyAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-6">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl dark:bg-slate-900">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Notification au médecin</p>
                <h3 className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">{selectedNotifyAlert.patient}</h3>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{selectedNotifyAlert.issue} • Chambre {selectedNotifyAlert.room}</p>
              </div>
              <button
                onClick={closeNotifyModal}
                className="rounded-2xl border border-slate-300 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:text-slate-200"
              >
                Fermer
              </button>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
              <p className="text-sm text-slate-500 dark:text-slate-400">Médecin en charge</p>
              <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">{selectedNotifyAlert.doctor}</p>
            </div>
            <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
              <p className="text-sm text-slate-500 dark:text-slate-400">État actuel</p>
              {getAlertState(selectedNotifyAlert.patient).notified ? (
                <p className="mt-2 text-base font-semibold text-slate-900 dark:text-white">Ce patient a déjà été notifié.</p>
              ) : (
                <p className="mt-2 text-base font-semibold text-slate-900 dark:text-white">Appuyez sur Notifier pour prévenir le médecin responsable.</p>
              )}
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <button
                onClick={notifyDoctor}
                className={`rounded-2xl px-4 py-3 text-sm font-semibold text-white ${getAlertState(selectedNotifyAlert.patient).notified ? "bg-slate-400" : "bg-red-700"}`}
                disabled={getAlertState(selectedNotifyAlert.patient).notified}
              >
                {getAlertState(selectedNotifyAlert.patient).notified ? "Notifié" : "Notifier"}
              </button>
              <button
                onClick={markSeen}
                className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
              >
                Marquer comme vu
              </button>
            </div>
            <div className="mt-5 rounded-3xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-950">
              <p className="text-sm text-slate-500 dark:text-slate-400">Statut de la notification</p>
              <p className="mt-2 text-base font-semibold text-slate-900 dark:text-white">
                {getAlertState(selectedNotifyAlert.patient).notified ? "Notification envoyée" : "Pas encore notifié"}
              </p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {getAlertState(selectedNotifyAlert.patient).seen ? "Vu par le médecin" : "Non encore vu par le médecin"}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
