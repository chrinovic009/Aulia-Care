import { useMemo, useState, useEffect } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "../ui/table";
import Badge from "../ui/badge/Badge";
import { fetchPatientsFromDatabase, PatientRecord } from "../../api/reception";

interface ReceptionRecord {
  id: number;
  patientId: string;
  patient: string;
  department: string;
  receptionist: string;
  arrivalTime: string;
  contactCount: number;
  contacts: Array<{ name: string; relation: string; phone: string; address: string }>;
  amountDue: string;
  statusSummary: string;
  status: string;
}

const mapPatientToReceptionRecord = (patient: PatientRecord, index: number): ReceptionRecord => {
  const createdAt = patient.createdAt ? new Date(patient.createdAt) : null;
  const patientName = (patient.name || `${patient.firstName || ""} ${patient.lastName || ""}`).trim() || "Patient";
  const receptionist = patient.receptionist?.trim() || "Réceptionniste";
  const workflowStatus = patient.workflowStatus || patient.status || "Enregistré";
  const statusSummary =
    workflowStatus === "EN_ATTENTE_DE_PAIEMENT"
      ? `Paiement en attente • ${patient.amountDue ?? 0} CDF`
      : workflowStatus === "EN_ATTENTE_INFIRMERIE"
      ? "Attente infirmière"
      : workflowStatus === "Fiche validée"
      ? "Paiement confirmé"
      : workflowStatus === "Fiche en attente"
      ? `Paiement en attente • ${patient.amountDue ?? 0} CDF`
      : workflowStatus === "Fiche annulé"
      ? "Fiche annulée"
      : workflowStatus === "En suivi"
      ? "En suivi clinique"
      : "Patient enregistré";

  return {
    id: index + 1,
    patientId: patient.id,
    patient: patientName,
    department: patient.service || patient.admissionType || "Accueil",
    receptionist,
    arrivalTime: createdAt ? createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--:--",
    contactCount: patient.contacts?.length || 0,
    contacts: patient.contacts || [],
    amountDue: patient.amountDue ? `${patient.amountDue} CDF` : "—",
    statusSummary,
    status: workflowStatus,
  };
};

export default function ReceptionRecentAdmissions() {
  const [searchValue, setSearchValue] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    | "All"
    | "EN_ATTENTE_DE_PAIEMENT"
    | "EN_ATTENTE_INFIRMERIE"
    | "Enregistré"
    | "Fiche en attente"
    | "Fiche validée"
    | "Fiche annulé"
    | "En suivi"
  >("All");
  const [tableData, setTableData] = useState<ReceptionRecord[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<ReceptionRecord | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadPatients = async () => {
      try {
        const patients = await fetchPatientsFromDatabase();
        if (!isMounted) return;
        setTableData(patients.map(mapPatientToReceptionRecord));
      } catch (error) {
        console.error("Impossible de charger les patients depuis la base de données:", error);
        if (!isMounted) return;
        setTableData([]);
      }
    };

    loadPatients();
    return () => {
      isMounted = false;
    };
  }, []);

  const filteredResults = useMemo(
    () =>
      tableData.filter((record) => {
        const matchesStatus = statusFilter === "All" || record.status === statusFilter;
        const normalizedSearch = searchValue.trim().toLowerCase();

        if (!normalizedSearch) {
          return matchesStatus;
        }

        const textMatch = [
          record.patient,
          record.department,
          record.receptionist,
          record.arrivalTime,
          record.amountDue,
          record.statusSummary,
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch);

        return matchesStatus && textMatch;
      }),
    [searchValue, statusFilter, tableData]
  );

  const openContactModal = (record: ReceptionRecord) => {
    setSelectedContacts(record);
  };

  const closeContactModal = () => {
    setSelectedContacts(null);
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white px-4 pb-3 pt-4 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6">

      {/* HEADER */}
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Admissions récentes</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">Patients enregistrés aujourd’hui à la réception.</p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="w-full sm:w-auto">
            <input
              type="text"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder="Rechercher un patient..."
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 shadow-theme-xs outline-none transition focus:border-theme-500 focus:ring-2 focus:ring-theme-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
            />
          </div>
          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 shadow-theme-xs outline-none transition focus:border-theme-500 focus:ring-2 focus:ring-theme-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
            >
              <option value="All">Tous les statuts</option>
              <option value="EN_ATTENTE_DE_PAIEMENT">EN_ATTENTE_DE_PAIEMENT</option>
              <option value="EN_ATTENTE_INFIRMERIE">EN_ATTENTE_INFIRMERIE</option>
              <option value="Enregistré">Enregistré</option>
              <option value="Fiche en attente">Fiche en attente</option>
              <option value="Fiche validée">Fiche validée</option>
              <option value="Fiche annulé">Fiche annulé</option>
              <option value="En suivi">En suivi</option>
            </select>
          </div>
        </div>
      </div>

      {/* TABLE */}
      <div className="max-w-full overflow-x-auto">
        <Table>
          <TableHeader className="border-y border-gray-100 dark:border-gray-800">
            <TableRow>
              <TableCell isHeader className="py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">Patient</TableCell>
              <TableCell isHeader className="py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">Service</TableCell>
              <TableCell isHeader className="py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">Réceptionniste</TableCell>
              <TableCell isHeader className="py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">Heure</TableCell>
              <TableCell isHeader className="py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">Contacts</TableCell>
              <TableCell isHeader className="py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">Statut</TableCell>
            </TableRow>
          </TableHeader>

          <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
            {filteredResults.map((record) => (
              <TableRow key={record.id}>
                <TableCell className="py-3 text-theme-sm text-gray-700 dark:text-gray-300">{record.patient}</TableCell>
                <TableCell className="py-3 text-theme-sm text-gray-500 dark:text-gray-400">{record.department}</TableCell>
                <TableCell className="py-3 text-theme-sm text-gray-500 dark:text-gray-400">{record.receptionist}</TableCell>
                <TableCell className="py-3 text-theme-sm text-gray-500 dark:text-gray-400">{record.arrivalTime}</TableCell>
                <TableCell className="py-3 text-theme-sm text-gray-500 dark:text-gray-400">
                  <button
                    onClick={() => openContactModal(record)}
                    className="text-left text-sm text-blue-600 hover:underline dark:text-blue-300"
                  >
                    {record.contactCount === 0
                      ? "Aucun contact"
                      : record.contactCount === 1
                      ? "1 contact"
                      : `${record.contactCount} contacts`}
                  </button>
                </TableCell>
                <TableCell className="py-3 text-theme-sm text-gray-500 dark:text-gray-400">
                  <div className="flex flex-col gap-1">
                    <span>{record.statusSummary}</span>
                    <Badge
                      size="sm"
                      color={
                        record.status === "Fiche validée"
                          ? "success"
                          : record.status === "Fiche en attente" || record.status === "EN_ATTENTE_DE_PAIEMENT" || record.status === "EN_ATTENTE_INFIRMERIE"
                          ? "warning"
                          : record.status === "En suivi"
                          ? "primary"
                          : record.status === "Fiche annulé"
                          ? "error"
                          : "light"
                      }
                    >
                      {record.status}
                    </Badge>
                  </div>
                </TableCell>
              </TableRow>
            ))}

            {filteredResults.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-theme-sm text-gray-500 dark:text-gray-400">
                  Aucun patient trouvé.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {selectedContacts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Contacts de {selectedContacts.patient}</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Relations enregistrées pour cette fiche.</p>
              </div>
              <button onClick={closeContactModal} className="text-gray-500 hover:text-gray-800 dark:text-gray-300">Fermer</button>
            </div>

            <div className="mt-5 space-y-4">
              {selectedContacts.contacts.length === 0 ? (
                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600 dark:border-slate-700 dark:bg-slate-900 dark:text-gray-300">
                  Aucun contact enregistré.
                </div>
              ) : (
                selectedContacts.contacts.map((contact, index) => (
                  <div key={index} className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-slate-700 dark:bg-slate-900">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-base font-semibold text-gray-900 dark:text-white">{contact.name || "Contact"}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Relation: {contact.relation || "—"}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Téléphone: {contact.phone || "—"}</p>
                      </div>
                      {contact.phone ? (
                        <a
                          href={`tel:${contact.phone}`}
                          className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
                        >
                          Appeler
                        </a>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
