import Chart from "react-apexcharts";
import { ApexOptions } from "apexcharts";
import { Dropdown } from "../ui/dropdown/Dropdown";
import { DropdownItem } from "../ui/dropdown/DropdownItem";
import { MoreDotIcon } from "../../icons";
import { useEffect, useState } from "react";
import { fetchPatientsFromDatabase } from "../../api/reception";

export default function ReceptionStatisticsChart() {
  const [categories, setCategories] = useState<string[]>([]);
  const [series, setSeries] = useState([{
    name: "Patients reçus",
    data: [] as number[],
  }, {
    name: "Rendez-vous",
    data: [] as number[],
  }, {
    name: "Urgences",
    data: [] as number[],
  }]);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const hasChartData = series.some((serie) => serie.data.some((value) => value > 0));
  const noChartData = !error && categories.length > 0 && !hasChartData;

  const options: ApexOptions = {
    colors: ["#16a34a", "#2563eb", "#dc2626"],
    chart: {
      fontFamily: "Outfit, sans-serif",
      type: "bar",
      height: 320,
      toolbar: {
        show: false,
      },
    },

    plotOptions: {
      bar: {
        horizontal: false,
        columnWidth: "45%",
        borderRadius: 6,
        borderRadiusApplication: "end",
      },
    },

    dataLabels: {
      enabled: false,
    },

    stroke: {
      show: true,
      width: 4,
      colors: ["transparent"],
    },

    xaxis: {
      categories: categories.length ? categories : [
        "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim",
      ],

      axisBorder: {
        show: false,
      },

      axisTicks: {
        show: false,
      },
    },

    legend: {
      show: true,
      position: "top",
      horizontalAlign: "left",
      fontFamily: "Outfit",
    },

    yaxis: {
      title: {
        text: "Patients",
      },
    },

    grid: {
      yaxis: {
        lines: {
          show: true,
        },
      },
    },

    fill: {
      opacity: 1,
    },

    tooltip: {
      x: {
        show: true,
      },

      y: {
        formatter: (val: number) => `${val} patients`,
      },
    },
  };

  useEffect(() => {
    const loadChartData = async () => {
      setError(null);
      const today = new Date();
      const labels: string[] = [];
      const dayKeys: string[] = [];

      for (let index = 6; index >= 0; index -= 1) {
        const date = new Date(today);
        date.setDate(today.getDate() - index);
        labels.push(date.toLocaleDateString("fr-FR", { weekday: "short" }));
        dayKeys.push(date.toISOString().slice(0, 10));
      }

      try {
            const patients = await fetchPatientsFromDatabase();

            const patientsData = dayKeys.map((key) =>
              patients.filter((patient) => {
                const createdAt = patient.createdAt ? new Date(patient.createdAt).toISOString().slice(0, 10) : "";
                return createdAt === key && patient.workflowStatus === "EN_ATTENTE_INFIRMERIE";
              }).length,
            );

            const appointmentsData = dayKeys.map((key) =>
              patients.filter((patient) => {
                const createdAt = patient.createdAt ? new Date(patient.createdAt).toISOString().slice(0, 10) : "";
                return (
                  createdAt === key &&
                  patient.workflowStatus === "EN_ATTENTE_INFIRMERIE" &&
                  (patient.admissionType?.toLowerCase().includes("consult") ||
                    patient.admissionType?.toLowerCase().includes("rendez") ||
                    patient.admissionType === "Consultation")
                );
              }).length,
            );

            const urgencesData = dayKeys.map((key) =>
              patients.filter((patient) => {
                const createdAt = patient.createdAt ? new Date(patient.createdAt).toISOString().slice(0, 10) : "";
                return (
                  createdAt === key &&
                  patient.workflowStatus === "EN_ATTENTE_INFIRMERIE" &&
                  ["urgent", "urgence", "prioritaire"].includes((patient.priority || "").toLowerCase())
                );
              }).length,
            );

        setCategories(labels);
        setSeries([
          { name: "Patients reçus", data: patientsData },
          { name: "Rendez-vous", data: appointmentsData },
          { name: "Urgences", data: urgencesData },
        ]);
      } catch (err) {
        console.error("Unable to load reception stats:", err);
        setError("Impossible de charger les statistiques depuis la base de données.");
      }
    };

    loadChartData();
  }, []);

  function toggleDropdown() {
    setIsOpen(!isOpen);
  }

  function closeDropdown() {
    setIsOpen(false);
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white px-5 pt-5 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6 sm:pt-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            Activité de la réception
          </h3>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            Flux hebdomadaire des patients et rendez-vous
          </p>
        </div>

        {/* Dropdown */}
        <div className="relative inline-block">
          <button className="dropdown-toggle" onClick={toggleDropdown}>
            <MoreDotIcon className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 size-6" />
          </button>

          <Dropdown
            isOpen={isOpen}
            onClose={closeDropdown}
            className="w-40 p-2"
          >
            <DropdownItem
              onItemClick={closeDropdown}
              className="flex w-full font-normal text-left text-gray-500 rounded-lg hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-300"
            >
              Voir statistiques
            </DropdownItem>

            <DropdownItem
              onItemClick={closeDropdown}
              className="flex w-full font-normal text-left text-gray-500 rounded-lg hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-300"
            >
              Exporter rapport
            </DropdownItem>
          </Dropdown>
        </div>
      </div>

      {/* Chart */}
      <div className="max-w-full overflow-x-auto custom-scrollbar">
        <div className="-ml-5 min-w-[650px] xl:min-w-full pl-2 min-h-[320px]">
          {error ? (
            <div className="flex h-[320px] items-center justify-center text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          ) : noChartData ? (
            <div className="flex h-[320px] items-center justify-center text-sm text-slate-500 dark:text-slate-400">
              Aucune donnée disponible pour cette semaine.
            </div>
          ) : (
            <Chart
              options={options}
              series={series}
              type="bar"
              height={320}
            />
          )}
        </div>
      </div>
    </div>
  );
}
