import { useEffect, useState } from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BoxIconLine,
  GroupIcon,
} from "../../icons";
import Badge from "../ui/badge/Badge";
import { fetchPatientsFromDatabase } from "../../api/reception";

export default function ReceptionMetrics() {
  const [waitingCount, setWaitingCount] = useState(0);
  const [todayAppointments, setTodayAppointments] = useState(0);

  const refreshMetrics = async () => {
    try {
      const patients = await fetchPatientsFromDatabase();
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const isToday = (dateString?: string) => {
        if (!dateString) return false;
        const date = new Date(dateString);
        date.setHours(0, 0, 0, 0);
        return date.getTime() === today.getTime();
      };

      setWaitingCount(
        patients.filter((patient) => patient.workflowStatus === "EN_ATTENTE_DE_PAIEMENT").length,
      );
      setTodayAppointments(
        patients.filter(
          (patient) =>
            patient.workflowStatus === "EN_ATTENTE_INFIRMERIE" && isToday(patient.createdAt),
        ).length,
      );
    } catch (error) {
      console.error("Unable to load reception metrics from Prisma DB:", error);
      setWaitingCount(0);
      setTodayAppointments(0);
    }
  };

  useEffect(() => {
    refreshMetrics();
    const handleUpdate = () => refreshMetrics();
    const storageHandler = (event: StorageEvent) => {
      if (event.key === "d7-clinic-patients" || event.key === "d7-clinic-reception-appointments") {
        refreshMetrics();
      }
    };

    window.addEventListener("d7:patientRecordsUpdated", handleUpdate as EventListener);
    window.addEventListener("storage", storageHandler as EventListener);
    return () => {
      window.removeEventListener("d7:patientRecordsUpdated", handleUpdate as EventListener);
      window.removeEventListener("storage", storageHandler as EventListener);
    };
  }, []);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6">
      {/* <!-- Metric Item Start --> */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
        <div className="flex items-center justify-center w-12 h-12 bg-gray-100 rounded-xl dark:bg-gray-800">
          <GroupIcon className="text-gray-800 size-6 dark:text-white/90" />
        </div>

        <div className="flex items-end justify-between mt-5">
          <div>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Patients en attente
            </span>
            <h4 className="mt-2 font-bold text-gray-800 text-title-sm dark:text-white/90">
              {waitingCount} Patients
            </h4>
          </div>
          <Badge color="warning">
            <ArrowUpIcon />
            Salle d'attente
          </Badge>
        </div>
      </div>
      {/* <!-- Metric Item End --> */}

      {/* <!-- Metric Item Start --> */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
        <div className="flex items-center justify-center w-12 h-12 bg-gray-100 rounded-xl dark:bg-gray-800">
          <BoxIconLine className="text-gray-800 size-6 dark:text-white/90" />
        </div>
        <div className="flex items-end justify-between mt-5">
          <div>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Rendez-vous aujourd’hui
            </span>
            <h4 className="mt-2 font-bold text-gray-800 text-title-sm dark:text-white/90">
              {todayAppointments} Rendez-vous
            </h4>
          </div>

          <Badge color="success">
            <ArrowDownIcon />
            Planning stable
          </Badge>
        </div>
      </div>
      {/* <!-- Metric Item End --> */}
    </div>
  );
}
