
import { useEffect, useMemo, useState } from "react";
import { fetchPatientsFromDatabase, PatientRecord } from "../../api/reception";

export default function ReceptionAssistantIA() {
  const [patients, setPatients] = useState<PatientRecord[]>([]);

  const refresh = async () => {
    try {
      const dbPatients = await fetchPatientsFromDatabase();
      setPatients(dbPatients);
    } catch (error) {
      console.error("Unable to load patients from Prisma DB:", error);
      setPatients([]);
    }
  };

  useEffect(() => {
    refresh();
    const handler = () => {
      refresh();
    };
    window.addEventListener("d7:patientRecordsUpdated", handler as EventListener);
    return () => {
      window.removeEventListener("d7:patientRecordsUpdated", handler as EventListener);
    };
  }, []);

  const waiting = useMemo(
    () => patients.filter((p) => p.workflowStatus === "EN_ATTENTE_DE_PAIEMENT"),
    [patients],
  );
  const awaitingNurse = useMemo(
    () => patients.filter((p) => p.workflowStatus === "EN_ATTENTE_INFIRMERIE"),
    [patients],
  );
  const urgent = useMemo(
    () =>
      patients.filter(
        (p) =>
          ["urgence", "urgent", "prioritaire"].includes((p.priority || "").toLowerCase()) &&
          p.workflowStatus === "EN_ATTENTE_INFIRMERIE",
      ),
    [patients],
  );

  const avgWaitMinutes = useMemo(() => {
    const queue = [...waiting, ...awaitingNurse];
    if (!queue.length) return 0;
    const totalMs = queue.reduce((acc, p) => acc + (Date.now() - new Date(p.createdAt).getTime()), 0);
    return Math.round((totalMs / queue.length) / 60000);
  }, [waiting, awaitingNurse]);

  const satisfactionPct = useMemo(() => {
    const a = awaitingNurse.length;
    const b = waiting.length;
    const denom = a + b;
    if (denom === 0) return 100;
    return Math.round((a / denom) * 100);
  }, [awaitingNurse.length, waiting.length]);

  const statusMessage = useMemo(() => {
    if (waiting.length === 0) {
      return "Aucun patient n’attend actuellement le paiement. Continuez à vérifier les dossiers et à orienter les admissions vers l’infirmerie.";
    }
    if (waiting.length <= 2) {
      return "Le flux paiement reste maîtrisé. Assurez-vous que les dossiers sont complets et que les règlements sont traités rapidement.";
    }
    if (waiting.length === 3) {
      return "Trois patients attendent le paiement. Renforcez le guichet encaissement et suivez de près les dossiers en cours.";
    }
    return "Plusieurs patients attendent le règlement. Priorisez le passage au guichet de paiement et envoyez ceux qui ont réglé vers l’infirmerie le plus vite possible.";
  }, [waiting.length]);

  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-100 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="px-5 pt-5 bg-white shadow-default rounded-2xl pb-11 dark:bg-gray-900 sm:px-6 sm:pt-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Assistant IA - Réception</h3>
            <p className="mt-1 text-gray-500 text-theme-sm dark:text-gray-400">Gestion intelligente du flux des patients</p>
          </div>

          <div className="flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 dark:bg-emerald-500/10">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">IA Active</span>
          </div>
        </div>

        {/* Alert Cards */}
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">

          {/* Patients */}
          <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
            <p className="text-xs text-gray-500 dark:text-gray-400">Patients en attente</p>
            <h4 className="mt-2 text-2xl font-bold text-gray-800 dark:text-white/90">{waiting.length}</h4>
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">Temps moyen : {avgWaitMinutes} min</p>
          </div>

          {/* Urgences */}
          <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
            <p className="text-xs text-gray-500 dark:text-gray-400">Cas prioritaires</p>
            <h4 className="mt-2 text-2xl font-bold text-red-600 dark:text-red-400">{urgent.length}</h4>
            <p className="mt-1 text-xs text-red-500">Prise en charge immédiate</p>
          </div>

          {/* Satisfaction */}
          <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
            <p className="text-xs text-gray-500 dark:text-gray-400">Fluidité d’accueil</p>
            <h4 className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400">{satisfactionPct}%</h4>
            <p className="mt-1 text-xs text-emerald-500">Activité stable</p>
          </div>
        </div>

        {/* Footer */}
        <p className="mx-auto mt-6 max-w-[600px] text-center text-sm leading-6 text-gray-500 dark:text-gray-400">
          {statusMessage}
        </p>
      </div>

      {/* Bottom Stats */}
      <div className="flex flex-col gap-4 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-center sm:text-left">
          <p className="text-xs text-gray-500 dark:text-gray-400">Admissions aujourd’hui</p>
          <p className="mt-1 text-lg font-semibold text-gray-800 dark:text-white/90">
            {patients.filter((p) => {
              if (p.workflowStatus !== "EN_ATTENTE_INFIRMERIE") return false;
              if (!p.createdAt) return false;
              const createdAt = new Date(p.createdAt);
              createdAt.setHours(0, 0, 0, 0);
              return createdAt.getTime() === new Date().setHours(0, 0, 0, 0);
            }).length} patients
          </p>
        </div>

        <div className="hidden h-10 w-px bg-gray-200 dark:bg-gray-800 sm:block"></div>

        <div className="text-center sm:text-left">
          <p className="text-xs text-gray-500 dark:text-gray-400">Rendez-vous confirmés</p>
          <p className="mt-1 text-lg font-semibold text-gray-800 dark:text-white/90">
            {patients.filter((p) => {
              if (p.workflowStatus !== "EN_ATTENTE_INFIRMERIE") return false;
              if (!p.createdAt) return false;
              const createdAt = new Date(p.createdAt);
              createdAt.setHours(0, 0, 0, 0);
              return (
                createdAt.getTime() === new Date().setHours(0, 0, 0, 0) &&
                (p.admissionType === "Consultation" || p.admissionType?.toLowerCase().includes("consult"))
              );
            }).length}
          </p>
        </div>

        <div className="hidden h-10 w-px bg-gray-200 dark:bg-gray-800 sm:block"></div>

        <div className="text-center sm:text-left">
          <p className="text-xs text-gray-500 dark:text-gray-400">Temps moyen d’attente</p>
          <p className="mt-1 text-lg font-semibold text-gray-800 dark:text-white/90">{avgWaitMinutes} min</p>
        </div>
      </div>
    </div>
  );
}
