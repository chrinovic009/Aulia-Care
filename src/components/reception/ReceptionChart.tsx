import { useEffect, useRef, useState } from "react";
import Chart from "react-apexcharts";
import { ApexOptions } from "apexcharts";
import flatpickr from "flatpickr";
import { CalenderIcon } from "../../icons";
import { fetchPatientsFromDatabase, fetchHospitalizationsFromDatabase, fetchAppointmentsFromDatabase } from "../../api/reception";

const rangeOptions = [
  { key: "today", label: "Aujourd'hui" },
  { key: "week", label: "Semaine" },
  { key: "month", label: "Mois" },
  { key: "year", label: "Année" },
] as const;

type RangeKey = (typeof rangeOptions)[number]["key"];


export default function StatisticsChart() {
  const datePickerRef = useRef<HTMLInputElement>(null);

  const [selectedRange, setSelectedRange] =
    useState<RangeKey>("month");

  const [categories, setCategories] = useState<string[]>([]);
  const [series, setSeries] = useState([
    { name: "Patients ambulants", data: [] as number[] },
    { name: "Patients hospitalisés", data: [] as number[] },
  ]);
  const [todayAdmissions, setTodayAdmissions] = useState(0);
  const [averageWait, setAverageWait] = useState("—");
  const [capacity, setCapacity] = useState("0%");
  const [error, setError] = useState<string | null>(null);

  const hasChartData = series.some((serie) => serie.data.some((value) => value > 0));
  const noChartData = !error && categories.length > 0 && !hasChartData;

  useEffect(() => {
    if (!datePickerRef.current) return;

    const today = new Date();

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(today.getDate() - 6);

    const fp = flatpickr(datePickerRef.current, {
      mode: "range",
      static: true,
      monthSelectorType: "static",
      dateFormat: "M d",
      defaultDate: [sevenDaysAgo, today],

      clickOpens: true,

      prevArrow:
        '<svg class="stroke-current" width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M12.5 15L7.5 10L12.5 5" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',

      nextArrow:
        '<svg class="stroke-current" width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M7.5 15L12.5 10L7.5 5" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    });

    return () => {
      if (!Array.isArray(fp)) {
        fp.destroy();
      }
    };
  }, []);

  useEffect(() => {
    const getBucketLabels = (range: RangeKey) => {
      if (range === "today") {
        return ["00h", "04h", "08h", "12h", "16h", "20h"];
      }

      if (range === "week") {
        return Array.from({ length: 7 }).map((_, index) => {
          const date = new Date();
          date.setDate(date.getDate() - (6 - index));
          return date.toLocaleDateString("fr-FR", { weekday: "short" });
        });
      }

      if (range === "month") {
        return ["S1", "S2", "S3", "S4"];
      }

      return [
        "Jan",
        "Fév",
        "Mar",
        "Avr",
        "Mai",
        "Juin",
        "Juil",
        "Août",
        "Sep",
        "Oct",
        "Nov",
        "Déc",
      ];
    };

    const getBucketIndex = (date: Date, range: RangeKey) => {
      const today = new Date();
      if (range === "today") {
        if (date.toDateString() !== today.toDateString()) return -1;
        return Math.min(5, Math.floor(date.getHours() / 4));
      }

      if (range === "week") {
        const keys = Array.from({ length: 7 }).map((_, index) => {
          const d = new Date();
          d.setDate(d.getDate() - (6 - index));
          return d.toISOString().slice(0, 10);
        });
        const key = date.toISOString().slice(0, 10);
        return keys.indexOf(key);
      }

      if (range === "month") {
        if (date.getMonth() !== today.getMonth() || date.getFullYear() !== today.getFullYear()) return -1;
        return Math.min(3, Math.floor((date.getDate() - 1) / 7));
      }

      if (range === "year") {
        if (date.getFullYear() !== today.getFullYear()) return -1;
        return date.getMonth();
      }

      return -1;
    };

    const loadChartData = async () => {
      setError(null);
      const labels = getBucketLabels(selectedRange);
      const patientCounts = new Array(labels.length).fill(0);
      const hospitalCounts = new Array(labels.length).fill(0);

      try {
        const [patients, hospitalizations, appointments] = await Promise.all([
          fetchPatientsFromDatabase(),
          fetchHospitalizationsFromDatabase(),
          fetchAppointmentsFromDatabase(),
        ]);

        patients.forEach((patient) => {
          if (!patient.createdAt) return;
          const date = new Date(patient.createdAt);
          const bucketIndex = getBucketIndex(date, selectedRange);
          if (bucketIndex >= 0) {
            patientCounts[bucketIndex] += 1;
          }
        });

        hospitalizations.forEach((hospitalization) => {
          if (!hospitalization.admittedAt) return;
          const date = new Date(hospitalization.admittedAt);
          const bucketIndex = getBucketIndex(date, selectedRange);
          if (bucketIndex >= 0) {
            hospitalCounts[bucketIndex] += 1;
          }
        });

        const today = new Date();
        const todayStart = new Date(today);
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(today);
        todayEnd.setHours(23, 59, 59, 999);

        setCategories(labels);
        setSeries([
          { name: "Patients ambulants", data: patientCounts },
          { name: "Patients hospitalisés", data: hospitalCounts },
        ]);

        setTodayAdmissions(
          patients.filter((patient) => {
            if (!patient.createdAt) return false;
            const createdAt = new Date(patient.createdAt);
            return createdAt >= todayStart && createdAt <= todayEnd;
          }).length,
        );

        const ongoingHospitalizations = hospitalizations.filter((hospitalization) => {
          if (!hospitalization.admittedAt) return false;
          const dischargedAt = hospitalization.dischargedAt ? new Date(hospitalization.dischargedAt) : null;
          return !dischargedAt || dischargedAt >= todayStart;
        }).length;

        setCapacity(
          patients.length > 0 ? `${Math.round((ongoingHospitalizations / patients.length) * 100)}%` : "0%",
        );

        const waitTimes = appointments
          .map((appointment) => {
            if (!appointment.createdAt || !appointment.scheduledAt) return null;
            const createdAt = new Date(appointment.createdAt);
            const scheduledAt = new Date(appointment.scheduledAt);
            const diffMinutes = (scheduledAt.getTime() - createdAt.getTime()) / 60000;
            return Number.isFinite(diffMinutes) && diffMinutes >= 0 ? diffMinutes : null;
          })
          .filter((minutes): minutes is number => minutes !== null);

        setAverageWait(
          waitTimes.length > 0 ? `${Math.round(waitTimes.reduce((sum, value) => sum + value, 0) / waitTimes.length)} min` : "—",
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(`Impossible de charger les statistiques depuis la base de données. ${message}`);
      }
    };

    loadChartData();
  }, [selectedRange]);

  const options: ApexOptions = {
    legend: {
      show: true,
      position: "top",
      horizontalAlign: "left",

      labels: {
        colors: ["#475569"],
      },
    },

    colors: ["#0078D7", "#34D399"],

    chart: {
      fontFamily: "Outfit, sans-serif",
      height: 340,
      type: "area",

      toolbar: {
        show: false,
      },
    },

    stroke: {
      curve: "smooth",
      width: [3, 3],
    },

    fill: {
      type: "gradient",

      gradient: {
        opacityFrom: 0.45,
        opacityTo: 0.05,
      },
    },

    markers: {
      size: 0,

      hover: {
        size: 6,
      },
    },

    grid: {
      xaxis: {
        lines: {
          show: false,
        },
      },

      yaxis: {
        lines: {
          show: true,
        },
      },
    },

    dataLabels: {
      enabled: false,
    },

    tooltip: {
      enabled: true,
    },

    xaxis: {
      type: "category",
      categories,

      axisBorder: {
        show: false,
      },

      axisTicks: {
        show: false,
      },
    },

    yaxis: {
      labels: {
        style: {
          fontSize: "12px",
          colors: ["#6B7280"],
        },
      },

      title: {
        text: "Patients",

        style: {
          fontSize: "12px",
          color: "#6B7280",
        },
      },
    },
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-5 pb-5 pt-5 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6 sm:pt-6">

      {/* HEADER */}
      <div className="mb-6 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">

        <div className="w-full">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            Flux des patients
          </h3>

          <p className="mt-1 text-gray-500 text-theme-sm dark:text-gray-400">
            Patients ambulants vs hospitalisés
          </p>
        </div>

        {/* FILTERS */}
        <div className="flex flex-col gap-3 sm:items-end">

          <div className="inline-flex rounded-full bg-slate-100 p-1 dark:bg-slate-800">

            {rangeOptions.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setSelectedRange(option.key)}
                className={`rounded-full px-3 py-2 text-sm font-medium transition ${
                  selectedRange === option.key
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
                    : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          {/* DATE PICKER */}
          <div className="relative inline-flex items-center">

            <CalenderIcon className="pointer-events-none absolute left-1/2 top-1/2 z-10 size-5 -translate-x-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 lg:left-3" />

            <input
              ref={datePickerRef}
              className="h-10 w-10 cursor-pointer rounded-lg border border-gray-200 bg-white text-sm font-medium text-transparent outline-none dark:border-gray-700 dark:bg-gray-800 lg:h-auto lg:w-40 lg:py-2 lg:pl-10 lg:pr-3 lg:text-gray-700 dark:lg:text-gray-300"
              placeholder="Choisir une plage"
            />
          </div>
        </div>
      </div>

      {/* CHART */}
      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-700 dark:bg-red-950/20 dark:text-red-300">
          {error}
        </div>
      ) : noChartData ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
          Aucune donnée disponible pour cette période.
        </div>
      ) : (
        <div className="max-w-full overflow-x-auto custom-scrollbar">
          <div className="min-w-[1000px] xl:min-w-full">
            <Chart
              options={options}
              series={series}
              type="area"
              height={340}
            />
          </div>
        </div>
      )}

      {/* FOOTER STATS */}
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">

        <div className="rounded-2xl bg-gray-50 p-4 dark:bg-white/[0.03]">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Admissions aujourd’hui
          </p>

          <h4 className="mt-2 text-2xl font-bold text-gray-800 dark:text-white/90">
            {todayAdmissions}
          </h4>
        </div>

        <div className="rounded-2xl bg-gray-50 p-4 dark:bg-white/[0.03]">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Temps moyen d’attente
          </p>

          <h4 className="mt-2 text-2xl font-bold text-amber-600 dark:text-amber-400">
            {averageWait}
          </h4>
        </div>

        <div className="rounded-2xl bg-gray-50 p-4 dark:bg-white/[0.03]">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Capacité actuelle
          </p>

          <h4 className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {capacity}
          </h4>
        </div>
      </div>
    </div>
  );
}