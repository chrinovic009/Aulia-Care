import { useEffect, useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "../ui/table";
import { fetchPatientsFromDatabase, PatientRecord } from "../../api/reception";

interface ReceptionRecord {
  id: number;
  patientId: string;
  patient: string;
  department: string;
  receptionist: string;
  arrivalTime: string;
  contacts: Array<{ name: string; relation: string; phone: string; address: string }>;
  statusSummary: string;
  status: string;
}

const parseMetadata = (patient: any) => {
  try {
    return Array.isArray(patient.medicalHistories) && patient.medicalHistories[0]?.details
      ? JSON.parse(patient.medicalHistories[0].details)
      : {};
  } catch {
    return {};
  }
};

const normalizeContacts = (patient: any, metadata: any) => {
  const contacts = patient.familyContacts || patient.contacts || metadata.familyContacts || [];
  return contacts.map((contact: any) => ({
    name: contact.name || "",
    relation: contact.relationship || contact.relation || "",
    phone: contact.phone || "",
    address: contact.address || "",
  }));
};

const mapPatientToReceptionRecord = (patient: PatientRecord, index: number): ReceptionRecord => {
  const metadata = parseMetadata(patient);
  const createdAt = patient.createdAt ? new Date(patient.createdAt) : null;
  const workflowStatus = patient.workflowStatus || patient.status || "Enregistre";
  const patientName = (patient.name || `${patient.firstName || ""} ${patient.lastName || ""}`).trim() || "Patient";
  const serviceName =
    typeof (patient as any).service === "string"
      ? (patient as any).service
      : (patient as any).service?.name;
  const statusSummary =
    workflowStatus === "EN_ATTENTE_DE_PAIEMENT"
      ? `Paiement en attente - ${patient.amountDue ?? 20} CDF`
      : workflowStatus === "EN_ATTENTE_INFIRMERIE"
      ? "Attente infirmerie"
      : workflowStatus === "EN_ATTENTE_VALIDATION_CAISSE"
      ? "Autorisation caisse"
      : workflowStatus === "TERMINE"
      ? "Parcours termine"
      : "Patient enregistre";
  const receptionist = (patient as any).receptionist;
  const receptionistName =
    metadata.receptionistName ||
    (typeof receptionist === "string" ? receptionist : "") ||
    receptionist?.displayName ||
    [receptionist?.firstName, receptionist?.lastName].filter(Boolean).join(" ") ||
    receptionist?.username ||
    "Receptionniste";

  return {
    id: index + 1,
    patientId: patient.id,
    patient: patientName,
    department: serviceName || patient.admissionType || "Accueil",
    receptionist: receptionistName,
    arrivalTime: createdAt ? createdAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "--:--",
    contacts: normalizeContacts(patient, metadata),
    statusSummary,
    status: workflowStatus,
  };
};

export default function ReceptionRecentAdmissions() {
  const [searchValue, setSearchValue] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [tableData, setTableData] = useState<ReceptionRecord[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<ReceptionRecord | null>(null);

  useEffect(() => {
    let isMounted = true;
    const loadPatients = async () => {
      try {
        const patients = await fetchPatientsFromDatabase();
        if (isMounted) setTableData(patients.map(mapPatientToReceptionRecord));
      } catch {
        if (isMounted) setTableData([]);
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
        const query = searchValue.trim().toLowerCase();
        if (!query) return matchesStatus;
        return (
          matchesStatus &&
          [record.patient, record.department, record.receptionist, record.statusSummary]
            .join(" ")
            .toLowerCase()
            .includes(query)
        );
      }),
    [searchValue, statusFilter, tableData],
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white px-4 pb-3 pt-4 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6">
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Admissions recentes</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">Patients enregistres aujourd'hui a la reception.</p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="text"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            placeholder="Rechercher un patient..."
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 sm:w-auto"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
          >
            <option value="All">Tous les statuts</option>
            <option value="EN_ATTENTE_DE_PAIEMENT">Paiement</option>
            <option value="EN_ATTENTE_INFIRMERIE">Infirmerie</option>
            <option value="EN_ATTENTE_VALIDATION_CAISSE">Autorisation caisse</option>
            <option value="TERMINE">Termine</option>
          </select>
        </div>
      </div>

      <div className="max-w-full overflow-x-auto">
        <Table>
          <TableHeader className="border-y border-gray-100 dark:border-gray-800">
            <TableRow>
              <TableCell isHeader className="py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">Patient</TableCell>
              <TableCell isHeader className="py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">Service</TableCell>
              <TableCell isHeader className="py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">Receptionniste</TableCell>
              <TableCell isHeader className="py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">Heure</TableCell>
              <TableCell isHeader className="py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">Contacts</TableCell>
              <TableCell isHeader className="py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">Statut</TableCell>
            </TableRow>
          </TableHeader>

          <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
            {filteredResults.map((record) => (
              <TableRow key={record.patientId}>
                <TableCell className="py-3 text-theme-sm text-gray-700 dark:text-gray-300">{record.patient}</TableCell>
                <TableCell className="py-3 text-theme-sm text-gray-500 dark:text-gray-400">{record.department}</TableCell>
                <TableCell className="py-3 text-theme-sm text-gray-500 dark:text-gray-400">{record.receptionist}</TableCell>
                <TableCell className="py-3 text-theme-sm text-gray-500 dark:text-gray-400">{record.arrivalTime}</TableCell>
                <TableCell className="max-w-[280px] py-3 text-theme-sm text-gray-500 dark:text-gray-400">
                  {record.contacts.length === 0 ? (
                    "Aucun contact"
                  ) : (
                    <button onClick={() => setSelectedContacts(record)} className="text-left text-blue-600 hover:underline dark:text-blue-300">
                      {record.contacts
                        .map((contact) => `${contact.name || "Contact"}${contact.phone ? ` (${contact.phone})` : ""}`)
                        .join(", ")}
                    </button>
                  )}
                </TableCell>
                <TableCell className="py-3 text-theme-sm text-gray-500 dark:text-gray-400">{record.statusSummary}</TableCell>
              </TableRow>
            ))}

            {filteredResults.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-theme-sm text-gray-500 dark:text-gray-400">
                  Aucun patient trouve.
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
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Relations enregistrees pour cette fiche.</p>
              </div>
              <button onClick={() => setSelectedContacts(null)} className="text-gray-500 hover:text-gray-800 dark:text-gray-300">Fermer</button>
            </div>

            <div className="mt-5 space-y-4">
              {selectedContacts.contacts.map((contact, index) => (
                <div key={`${contact.phone}-${index}`} className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-slate-700 dark:bg-slate-900">
                  <p className="text-base font-semibold text-gray-900 dark:text-white">{contact.name || "Contact"}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Relation: {contact.relation || "-"}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Telephone: {contact.phone || "-"}</p>
                  {contact.address && <p className="text-sm text-gray-500 dark:text-gray-400">Adresse: {contact.address}</p>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
