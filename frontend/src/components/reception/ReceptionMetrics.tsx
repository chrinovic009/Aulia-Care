import { useEffect, useState } from "react";
import { BoxIconLine, GroupIcon } from "../../icons";
import Badge from "../ui/badge/Badge";
import { fetchAppointmentsFromDatabase, fetchPatientsFromDatabase } from "../../api/reception";

export default function ReceptionMetrics() {
  const [waitingCount, setWaitingCount] = useState<number | null>(null);
  const [todayAppointments, setTodayAppointments] = useState<number | null>(null);

  const refreshMetrics = async () => {
    try {
      const [patients, appointments] = await Promise.all([
        fetchPatientsFromDatabase(),
        fetchAppointmentsFromDatabase(),
      ]);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const isToday = (dateString?: string) => {
        if (!dateString) return false;
        const date = new Date(dateString);
        date.setHours(0, 0, 0, 0);
        return date.getTime() === today.getTime();
      };

      setWaitingCount(
        patients.filter((patient) => isToday(patient.createdAt)).length,
      );
      setTodayAppointments(
        appointments.filter((appointment) => isToday(appointment.scheduledAt || appointment.requestedAt || appointment.createdAt)).length,
      );
    } catch (error) {
      console.error("Unable to load reception metrics from Prisma DB:", error);
      setWaitingCount(null);
      setTodayAppointments(null);
    }
  };

  useEffect(() => {
    refreshMetrics();
    const handleUpdate = () => refreshMetrics();
    window.addEventListener("d7:patientRecordsUpdated", handleUpdate as EventListener);
    return () => {
      window.removeEventListener("d7:patientRecordsUpdated", handleUpdate as EventListener);
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
              Admissions aujourd’hui
            </span>
            <h4 className="mt-2 font-bold text-gray-800 text-title-sm dark:text-white/90">
              {waitingCount === null ? "Indisponible" : `${waitingCount} patient${waitingCount > 1 ? "s" : ""}`}
            </h4>
          </div>
          <Badge color="warning">Temps réel</Badge>
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
              {todayAppointments === null ? "Indisponible" : `${todayAppointments} rendez-vous`}
            </h4>
          </div>

          <Badge color="success">Base de données</Badge>
        </div>
      </div>
      {/* <!-- Metric Item End --> */}
    </div>
  );
}
