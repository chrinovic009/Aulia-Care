
import { useEffect, useMemo, useState } from "react";
import { getAllPatients, PatientRecord } from "../../api/reception";

export default function ReceptionAssistantIA() {
  const [patients, setPatients] = useState<PatientRecord[]>([]);

  const refresh = () => {
    setPatients(getAllPatients());
  };

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    const storageHandler = (ev: StorageEvent) => {
      if (ev.key === "d7-clinic-patients") refresh();
    };
    window.addEventListener("d7:patientRecordsUpdated", handler as EventListener);
    window.addEventListener("storage", storageHandler as EventListener);
    return () => {
      window.removeEventListener("d7:patientRecordsUpdated", handler as EventListener);
      window.removeEventListener("storage", storageHandler as EventListener);
    };
  }, []);

  const waiting = useMemo(() => patients.filter((p) => p.status === "Fiche en attente"), [patients]);
  const urgent = useMemo(() => patients.filter((p) => (p.priority || "").toLowerCase() === "urgence" || (p.priority || "").toLowerCase() === "urgente"), [patients]);
  const inFollowup = useMemo(() => patients.filter((p) => p.status === "En suivi"), [patients]);

  const avgWaitMinutes = useMemo(() => {
    if (!waiting.length) return 0;
    const totalMs = waiting.reduce((acc, p) => acc + (Date.now() - new Date(p.createdAt).getTime()), 0);
    return Math.round((totalMs / waiting.length) / 60000);
  }, [waiting]);

  const satisfactionPct = useMemo(() => {
    const a = inFollowup.length;
    const b = waiting.length;
    const denom = a + b;
    if (denom === 0) return 100;
    return Math.round((a / denom) * 100);
  }, [inFollowup.length, waiting.length]);

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
          L’assistant IA analyse en temps réel les admissions, les urgences, les disponibilités médicales et la charge des services afin d’aider la réception à maintenir une circulation fluide des patients.
        </p>
      </div>

      {/* Bottom Stats */}
      <div className="flex flex-col gap-4 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-center sm:text-left">
          <p className="text-xs text-gray-500 dark:text-gray-400">Admissions aujourd’hui</p>
          <p className="mt-1 text-lg font-semibold text-gray-800 dark:text-white/90">{patients.length} patients</p>
        </div>

        <div className="hidden h-10 w-px bg-gray-200 dark:bg-gray-800 sm:block"></div>

        <div className="text-center sm:text-left">
          <p className="text-xs text-gray-500 dark:text-gray-400">Rendez-vous confirmés</p>
          <p className="mt-1 text-lg font-semibold text-gray-800 dark:text-white/90">{patients.filter(p => p.admissionType === 'Consultation').length}</p>
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
