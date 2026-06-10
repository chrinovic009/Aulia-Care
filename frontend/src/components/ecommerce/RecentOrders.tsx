import { useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "../ui/table";
import Badge from "../ui/badge/Badge";

// Define the TypeScript interface for the table rows
interface HealthResult {
  id: number; // Unique identifier for each record
  patient: string; // Patient name
  exam: string; // Exam or test performed
  department: string; // Hospital department
  doctor: string; // Doctor who ordered or reviewed the exam
  date: string; // Date of the exam
  resultSummary: string; // Brief summary of the result
  image: string; // URL or path to a patient/test avatar image
  status: "Normal" | "Abnormal" | "Pending"; // Result status
}

// Define the table data using the interface
const tableData: HealthResult[] = [
  {
    id: 1,
    patient: "Sofia Mbaye",
    exam: "Bilan sanguin complet",
    department: "Biologie médicale",
    doctor: "Dr. Ndiaye",
    date: "12 mai 2026",
    resultSummary: "Taux de fer dans la norme",
    status: "Normal",
    image: "/images/product/product-01.jpg",
  },
  {
    id: 2,
    patient: "Lamine Diarra",
    exam: "Scanner thoracique",
    department: "Radiologie",
    doctor: "Dr. Fall",
    date: "14 mai 2026",
    resultSummary: "Légère inflammation détectée",
    status: "Abnormal",
    image: "/images/product/product-02.jpg",
  },
  {
    id: 3,
    patient: "Awa Touré",
    exam: "IRM cérébrale",
    department: "Neurologie",
    doctor: "Dr. Coulibaly",
    date: "15 mai 2026",
    resultSummary: "Aucun signe de lésion anormale",
    status: "Normal",
    image: "/images/product/product-03.jpg",
  },
  {
    id: 4,
    patient: "Mamadou Keita",
    exam: "Échographie abdominale",
    department: "Imagerie médicale",
    doctor: "Dr. Traoré",
    date: "16 mai 2026",
    resultSummary: "Suspicion de calcul biliaire",
    status: "Abnormal",
    image: "/images/product/product-04.jpg",
  },
  {
    id: 5,
    patient: "Fatoumata Sarr",
    exam: "ECG",
    department: "Cardiologie",
    doctor: "Dr. Ndiaye",
    date: "16 mai 2026",
    resultSummary: "Rythme cardiaque régulier",
    status: "Normal",
    image: "/images/product/product-05.jpg",
  },
];

export default function RecentOrders() {
  const [searchValue, setSearchValue] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | "Normal" | "Abnormal" | "Pending">("All");

  const filteredResults = useMemo(
    () =>
      tableData.filter((record) => {
        const matchesStatus =
          statusFilter === "All" || record.status === statusFilter;
        const normalizedSearch = searchValue.trim().toLowerCase();

        if (!normalizedSearch) {
          return matchesStatus;
        }

        const textMatch = [
          record.exam,
          record.department,
          record.doctor,
          record.date,
          record.resultSummary,
          record.status,
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch);

        return matchesStatus && textMatch;
      }),
    [searchValue, statusFilter]
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white px-4 pb-3 pt-4 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6">
      <div className="flex flex-col gap-4 mb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            Résultats de santé récents
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Voici vos examens hospitaliers récents.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="w-full sm:w-auto">
            <label className="sr-only" htmlFor="search-results">
              Rechercher
            </label>
            <input
              id="search-results"
              type="text"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder="Recherche libre..."
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 shadow-theme-xs outline-none transition focus:border-theme-500 focus:ring-2 focus:ring-theme-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-theme-400"
            />
          </div>
          <div>
            <label className="sr-only" htmlFor="status-filter">
              Filtrer par statut
            </label>
            <select
              id="status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 shadow-theme-xs outline-none transition focus:border-theme-500 focus:ring-2 focus:ring-theme-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-theme-400"
            >
              <option value="All">Tous les statuts</option>
              <option value="Normal">Normal</option>
              <option value="Abnormal">Anormal</option>
              <option value="Pending">En attente</option>
            </select>
          </div>
        </div>
      </div>

      <div className="max-w-full overflow-x-auto">
        <Table>
          {/* Table Header */}
          <TableHeader className="border-gray-100 dark:border-gray-800 border-y">
            <TableRow>
              <TableCell
                isHeader
                className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
              >
                Examen
              </TableCell>
              <TableCell
                isHeader
                className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
              >
                Service
              </TableCell>
              <TableCell
                isHeader
                className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
              >
                Médecin
              </TableCell>
              <TableCell
                isHeader
                className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
              >
                Date
              </TableCell>
              <TableCell
                isHeader
                className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
              >
                Résultat
              </TableCell>
            </TableRow>
          </TableHeader>

          {/* Table Body */}
          <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
            {filteredResults.map((record) => (
              <TableRow key={record.id} className="">
                <TableCell className="py-3 text-gray-500 text-theme-sm dark:text-gray-400">
                  {record.exam}
                </TableCell>
                <TableCell className="py-3 text-gray-500 text-theme-sm dark:text-gray-400">
                  {record.department}
                </TableCell>
                <TableCell className="py-3 text-gray-500 text-theme-sm dark:text-gray-400">
                  {record.doctor}
                </TableCell>
                <TableCell className="py-3 text-gray-500 text-theme-sm dark:text-gray-400">
                  {record.date}
                </TableCell>
                <TableCell className="py-3 text-gray-500 text-theme-sm dark:text-gray-400">
                  <div className="flex flex-col gap-1">
                    <span>{record.resultSummary}</span>
                    <Badge
                      size="sm"
                      color={
                        record.status === "Normal"
                          ? "success"
                          : record.status === "Pending"
                          ? "warning"
                          : "error"
                      }
                    >
                      {record.status === "Abnormal" ? "Anormal" : record.status}
                    </Badge>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filteredResults.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-8 text-center text-gray-500 text-theme-sm dark:text-gray-400"
                >
                  Aucun résultat ne correspond à votre recherche.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
