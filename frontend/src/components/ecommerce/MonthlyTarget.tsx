import Chart from "react-apexcharts";
import { ApexOptions } from "apexcharts";
import { useState } from "react";
import { Dropdown } from "../ui/dropdown/Dropdown";
import { DropdownItem } from "../ui/dropdown/DropdownItem";
import { MoreDotIcon } from "../../icons";

export default function MonthlyTarget() {
  const series = [25];
  const options: ApexOptions = {
    colors: ["#34D399"],
    chart: {
      fontFamily: "Outfit, sans-serif",
      type: "radialBar",
      height: 330,
      sparkline: {
        enabled: true,
      },
    },
    plotOptions: {
      radialBar: {
        startAngle: -85,
        endAngle: 85,
        hollow: {
          size: "80%",
        },
        track: {
          background: "#E4E7EC",
          strokeWidth: "100%",
          margin: 5,
        },
        dataLabels: {
          name: {
            show: false,
          },
          value: {
            fontSize: "36px",
            fontWeight: "600",
            offsetY: -40,
            color: "#1D2939",
            formatter: function (val) {
              return `${val}%`;
            },
          },
        },
      },
    },
    fill: {
      type: "solid",
      colors: ["#34D399"],
    },
    stroke: {
      lineCap: "round",
    },
    labels: ["Convalescence"],
  };
  const [isOpen, setIsOpen] = useState(false);

  function toggleDropdown() {
    setIsOpen(!isOpen);
  }

  function closeDropdown() {
    setIsOpen(false);
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-100 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="px-5 pt-5 bg-white shadow-default rounded-2xl pb-11 dark:bg-gray-900 sm:px-6 sm:pt-6">
        <div className="flex justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
              Suivi de convalescence
            </h3>
            <p className="mt-1 text-gray-500 text-theme-sm dark:text-gray-400">
              Cure de 8 jours — jour 2 sur 8
            </p>
          </div>
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
                Voir le détail
              </DropdownItem>
              <DropdownItem
                onItemClick={closeDropdown}
                className="flex w-full font-normal text-left text-gray-500 rounded-lg hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-300"
              >
                Mettre à jour
              </DropdownItem>
            </Dropdown>
          </div>
        </div>

        <div className="relative">
          <div className="max-h-[330px]" id="chartDarkStyle">
            <Chart
              options={options}
              series={series}
              type="radialBar"
              height={330}
            />
          </div>

          <span className="absolute left-1/2 top-full -translate-x-1/2 -translate-y-[95%] rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
            +25% de cure
          </span>
        </div>

        <div className="mt-6 rounded-3xl border border-teal-100 bg-teal-50/70 p-4 text-sm text-teal-900 dark:border-teal-800 dark:bg-teal-900/20 dark:text-teal-100">
          <p className="font-medium">Assistant IA :</p>
          <p className="mt-2 text-sm leading-6">
            Rappel de prise du jour : matin à <span className="font-semibold">08:00</span> et soir à <span className="font-semibold">21:00</span>. Pensez à bien noter votre état après chaque prise.
          </p>
        </div>

        <p className="mx-auto mt-6 w-full max-w-[380px] text-center text-sm text-gray-500 sm:text-base dark:text-gray-400">
          Votre progression de convalescence est stable. Continuez la cure et suivez les rappels pour rester sur la bonne voie.
        </p>
      </div>

      <div className="flex flex-col gap-4 px-6 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-8 sm:py-5">
        <div className="text-center sm:text-left">
          <p className="mb-1 text-gray-500 text-theme-xs dark:text-gray-400 sm:text-sm">
            Durée totale
          </p>
          <p className="text-base font-semibold text-gray-800 dark:text-white/90 sm:text-lg">
            8 jours
          </p>
        </div>

        <div className="w-full h-px bg-gray-200 dark:bg-gray-800 sm:hidden"></div>

        <div className="text-center sm:text-left">
          <p className="mb-1 text-gray-500 text-theme-xs dark:text-gray-400 sm:text-sm">
            Jours pris
          </p>
          <p className="text-base font-semibold text-gray-800 dark:text-white/90 sm:text-lg">
            2 jours
          </p>
        </div>

        <div className="w-full h-px bg-gray-200 dark:bg-gray-800 sm:hidden"></div>

        <div className="text-center sm:text-left">
          <p className="mb-1 text-gray-500 text-theme-xs dark:text-gray-400 sm:text-sm">
            Prochaine prise
          </p>
          <p className="text-base font-semibold text-gray-800 dark:text-white/90 sm:text-lg">
            08:00</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">et 21:00 ce soir</p>
        </div>
      </div>
    </div>
  );
}
