import { useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "../../ui/table";

import Badge from "../../ui/badge/Badge";

interface HealthResult {
  id: number;
  exam: string;
  department: string;
  doctor: string;
  date: string;
  resultSummary: string;
  status: "Normal" | "Abnormal" | "Pending";
}

// Define the table data - All exams for a single patient
const patientName = "Chrinovic Nyembo";
const tableData: HealthResult[] = [
  {
    id: 1,
    exam: "Bilan sanguin complet",
    department: "Biologie médicale",
    doctor: "Dr. Ndiaye",
    date: "12 mai 2026",
    resultSummary: "Taux de fer dans la norme",
    status: "Normal",
  },
  {
    id: 2,
    exam: "Scanner thoracique",
    department: "Radiologie",
    doctor: "Dr. Fall",
    date: "14 mai 2026",
    resultSummary: "Légère inflammation détectée",
    status: "Abnormal",
  },
  {
    id: 3,
    exam: "IRM cérébrale",
    department: "Neurologie",
    doctor: "Dr. Coulibaly",
    date: "15 mai 2026",
    resultSummary: "Aucun signe de lésion anormale",
    status: "Normal",
  },
  {
    id: 4,
    exam: "Échographie abdominale",
    department: "Imagerie médicale",
    doctor: "Dr. Traoré",
    date: "16 mai 2026",
    resultSummary: "Suspicion de calcul biliaire",
    status: "Abnormal",
  },
  {
    id: 5,
    exam: "ECG",
    department: "Cardiologie",
    doctor: "Dr. Ndiaye",
    date: "16 mai 2026",
    resultSummary: "Rythme cardiaque régulier",
    status: "Normal",
  },
  {
    id: 6,
    exam: "Test de stress",
    department: "Cardiologie",
    doctor: "Dr. Sarr",
    date: "17 mai 2026",
    resultSummary: "Aucune anomalie détectée",
    status: "Normal",
  },
  {
    id: 7,
    exam: "Analyse d'urine",
    department: "Biologie médicale",
    doctor: "Dr. Diop",
    date: "18 mai 2026",
    resultSummary: "Résultats normaux",
    status: "Normal",
  },
  {
    id: 8,
    exam: "Radiographie pulmonaire",
    department: "Radiologie",
    doctor: "Dr. Fall",
    date: "19 mai 2026",
    resultSummary: "Pas d'anomalie visible",
    status: "Normal",
  },
  {
    id: 9,
    exam: "Biopsy cutanée",
    department: "Dermatologie",
    doctor: "Dr. Bah",
    date: "20 mai 2026",
    resultSummary: "Résultats en attente",
    status: "Pending",
  },
  {
    id: 10,
    exam: "Endoscopie digestive",
    department: "Gastroentérologie",
    doctor: "Dr. Ka",
    date: "21 mai 2026",
    resultSummary: "Légère inflammation gastrique",
    status: "Abnormal",
  },
  {
    id: 11,
    exam: "IRM abdominale",
    department: "Radiologie",
    doctor: "Dr. Fall",
    date: "22 mai 2026",
    resultSummary: "Aucune pathologie majeure",
    status: "Normal",
  },
  {
    id: 12,
    exam: "Test allergique",
    department: "Immunologie",
    doctor: "Dr. Sow",
    date: "23 mai 2026",
    resultSummary: "Allergie à la pénicilline confirmée",
    status: "Abnormal",
  },
  {
    id: 13,
    exam: "Audiométrie",
    department: "ORL",
    doctor: "Dr. Toure",
    date: "24 mai 2026",
    resultSummary: "Audition normale pour l'âge",
    status: "Normal",
  },
  {
    id: 14,
    exam: "Densitométrie osseuse",
    department: "Rhumatologie",
    doctor: "Dr. Ndiaye",
    date: "25 mai 2026",
    resultSummary: "Densité osseuse normale",
    status: "Normal",
  },
  {
    id: 15,
    exam: "Test de vision",
    department: "Ophtalmologie",
    doctor: "Dr. Diallo",
    date: "26 mai 2026",
    resultSummary: "Correction optique recommandée",
    status: "Abnormal",
  },
  {
    id: 16,
    exam: "Échographie thyroïde",
    department: "Endocrinologie",
    doctor: "Dr. Diouf",
    date: "27 mai 2026",
    resultSummary: "Thyroïde de taille normale",
    status: "Normal",
  },
  {
    id: 17,
    exam: "Lipidogramme",
    department: "Biologie médicale",
    doctor: "Dr. Diop",
    date: "28 mai 2026",
    resultSummary: "Cholestérol légèrement élevé",
    status: "Abnormal",
  },
  {
    id: 18,
    exam: "Glycémie à jeun",
    department: "Biologie médicale",
    doctor: "Dr. Ndiaye",
    date: "29 mai 2026",
    resultSummary: "Glycémie normale",
    status: "Normal",
  },
];

export default function BasicTableOne() {
  const [searchValue, setSearchValue] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "All" | "Normal" | "Abnormal" | "Pending"
  >("All");
  const [currentPage, setCurrentPage] = useState(0);

  const ITEMS_PER_PAGE = 15;

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

  const totalPages = Math.ceil(filteredResults.length / ITEMS_PER_PAGE);
  const startIndex = currentPage * ITEMS_PER_PAGE;
  const paginatedResults = filteredResults.slice(
    startIndex,
    startIndex + ITEMS_PER_PAGE
  );

  const handleNextPage = () => {
    if (currentPage < totalPages - 1) {
      setCurrentPage(currentPage + 1);
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 0) {
      setCurrentPage(currentPage - 1);
    }
  };

  // Reset to first page when filter changes
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchValue(e.target.value);
    setCurrentPage(0);
  };

  const handleStatusFilterChange = (
    e: React.ChangeEvent<HTMLSelectElement>
  ) => {
    setStatusFilter(e.target.value as any);
    setCurrentPage(0);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
      {/* Header with filters */}
      <div className="px-5 py-4 sm:px-6">
        <div className="flex flex-col gap-4 mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
              Examens et résultats médicaux
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Dossier de {patientName}
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="w-full sm:w-auto">
              <label className="sr-only" htmlFor="search-results">
                Rechercher
              </label>
              <input
                id="search-results"
                type="text"
                value={searchValue}
                onChange={handleSearchChange}
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
                onChange={handleStatusFilterChange}
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
      </div>

      {/* Table */}
      <div className="max-w-full overflow-x-auto">
        <Table>
          {/* Table Header */}
          <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
            <TableRow>
              <TableCell
                isHeader
                className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
              >
                Examen
              </TableCell>
              <TableCell
                isHeader
                className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
              >
                Service
              </TableCell>
              <TableCell
                isHeader
                className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
              >
                Médecin
              </TableCell>
              <TableCell
                isHeader
                className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
              >
                Date
              </TableCell>
              <TableCell
                isHeader
                className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
              >
                Résultat
              </TableCell>
            </TableRow>
          </TableHeader>

          {/* Table Body */}
          <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
            {paginatedResults.map((record) => (
              <TableRow key={record.id}>
                <TableCell className="px-5 py-3 text-gray-500 text-start text-theme-sm dark:text-gray-400">
                  {record.exam}
                </TableCell>
                <TableCell className="px-4 py-3 text-gray-500 text-start text-theme-sm dark:text-gray-400">
                  {record.department}
                </TableCell>
                <TableCell className="px-4 py-3 text-gray-500 text-start text-theme-sm dark:text-gray-400">
                  {record.doctor}
                </TableCell>
                <TableCell className="px-4 py-3 text-gray-500 text-start text-theme-sm dark:text-gray-400">
                  {record.date}
                </TableCell>
                <TableCell className="px-4 py-3 text-gray-500 text-start text-theme-sm dark:text-gray-400">
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
            {paginatedResults.length === 0 && (
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

      {/* Pagination Navigation */}
      {filteredResults.length > ITEMS_PER_PAGE && (
        <div className="flex items-center justify-between border-t border-gray-100 px-5 py-4 dark:border-white/[0.05] sm:px-6">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {filteredResults.length > 0 && (
              <>
                Affichage {startIndex + 1} à{" "}
                {Math.min(startIndex + ITEMS_PER_PAGE, filteredResults.length)}{" "}
                sur {filteredResults.length} résultats
              </>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handlePrevPage}
              disabled={currentPage === 0}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-theme-xs outline-none transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              ← Précédent
            </button>
            <div className="flex gap-2">
              {Array.from({ length: totalPages }, (_, i) => i).map((page) => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                    currentPage === page
                      ? "bg-theme-500 text-white"
                      : "bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                  }`}
                >
                  {page + 1}
                </button>
              ))}
            </div>
            <button
              onClick={handleNextPage}
              disabled={currentPage === totalPages - 1}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-theme-xs outline-none transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              Suivant →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
