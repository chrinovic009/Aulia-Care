import { useEffect, useRef, useState } from "react";
import Chart from "react-apexcharts";
import { ApexOptions } from "apexcharts";
import flatpickr from "flatpickr";
import { CalenderIcon } from "../../icons";

const rangeOptions = [
  { key: "today", label: "Aujourd'hui" },
  { key: "month", label: "Mois" },
  { key: "quarter", label: "Trimestre" },
  { key: "year", label: "Année" },
] as const;

type RangeKey = (typeof rangeOptions)[number]["key"];

const chartData: Record<RangeKey, { categories: string[]; series: { name: string; data: number[] }[] }> = {
  today: {
    categories: ["08h", "12h", "16h", "20h"],
    series: [
      { name: "Récupération", data: [70, 75, 72, 78] },
      { name: "Sommeil", data: [65, 68, 67, 70] },
    ],
  },
  month: {
    categories: ["S1", "S2", "S3", "S4"],
    series: [
      { name: "Récupération", data: [68, 72, 75, 79] },
      { name: "Sommeil", data: [60, 65, 68, 72] },
    ],
  },
  quarter: {
    categories: ["Mois 1", "Mois 2", "Mois 3"],
    series: [
      { name: "Récupération", data: [70, 74, 78] },
      { name: "Sommeil", data: [63, 69, 72] },
    ],
  },
  year: {
    categories: ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"],
    series: [
      { name: "Récupération", data: [65, 68, 70, 72, 75, 78, 80, 79, 81, 83, 84, 86] },
      { name: "Sommeil", data: [58, 60, 62, 65, 68, 70, 72, 71, 73, 75, 76, 78] },
    ],
  },
};

export default function StatisticsChart() {
  const datePickerRef = useRef<HTMLInputElement>(null);
  const [selectedRange, setSelectedRange] = useState<RangeKey>("month");

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
        '<svg class="stroke-current" width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12.5 15L7.5 10L12.5 5" stroke="" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      nextArrow:
        '<svg class="stroke-current" width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7.5 15L12.5 10L7.5 5" stroke="" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    });

    return () => {
      if (!Array.isArray(fp)) {
        fp.destroy();
      }
    };
  }, []);

  const { categories, series } = chartData[selectedRange];

  const options: ApexOptions = {
    legend: {
      show: true,
      position: "top",
      horizontalAlign: "left",
      labels: {
        colors: ["#475569"],
      },
    },
    colors: ["#f53030", "#0078D7"],
    chart: {
      fontFamily: "Outfit, sans-serif",
      height: 340,
      type: "area",
      toolbar: {
        show: false,
      },
    },
    stroke: {
      curve: "straight",
      width: [2, 2],
    },
    fill: {
      type: "gradient",
      gradient: {
        opacityFrom: 0.55,
        opacityTo: 0,
      },
    },
    markers: {
      size: 0,
      strokeColors: "#fff",
      strokeWidth: 2,
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
      x: {
        format: "dd MMM yyyy",
      },
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
      tooltip: {
        enabled: false,
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
        text: "Score",
        style: {
          fontSize: "12px",
          color: "#6B7280",
        },
      },
    },
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-5 pb-5 pt-5 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6 sm:pt-6">
      <div className="flex flex-col gap-5 mb-6 sm:flex-row sm:justify-between sm:items-start">
        <div className="w-full">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            Statistiques sanitaires
          </h3>
          <p className="mt-1 text-gray-500 text-theme-sm dark:text-gray-400">
            Suivi de votre convalescence et de vos constantes médicales
          </p>
        </div>

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
          <div className="relative inline-flex items-center">
            <CalenderIcon className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 lg:left-3 size-5 text-gray-500 dark:text-gray-400 pointer-events-none z-10" />
            <input
              ref={datePickerRef}
              className="h-10 w-10 lg:w-40 lg:h-auto lg:pl-10 lg:pr-3 lg:py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-transparent lg:text-gray-700 outline-none dark:border-gray-700 dark:bg-gray-800 dark:lg:text-gray-300 cursor-pointer"
              placeholder="Choisir une plage"
            />
          </div>
        </div>
      </div>

      <div className="max-w-full overflow-x-auto custom-scrollbar">
        <div className="min-w-[1000px] xl:min-w-full">
          <Chart options={options} series={series} type="area" height={340} />
        </div>
      </div>
    </div>
  );
}
