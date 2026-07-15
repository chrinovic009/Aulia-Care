import React from "react";

interface HistoryRecord {
  id: string;
  type: "payment" | "invoice";
  patientName: string;
  patientCompany?: string | null;
  patientPhone?: string;
  patientEmail?: string;
  amount: number;
  status?: string;
  method?: string;
  reference?: string;
  createdAt: string;
  invoiceType?: string;
}

interface HistoryPrintProps {
  records: HistoryRecord[];
  clinicName?: string;
  clinicAddress?: string;
  clinicPhone?: string;
  printDate?: string;
}

export const HistoryPrintTemplate: React.FC<HistoryPrintProps> = ({
  records,
  printDate = new Date().toLocaleDateString("fr-FR"),
}) => {
  const totalPayments = records
    .filter((r) => r.type === "payment")
    .reduce((sum, r) => sum + Number(r.amount || 0), 0);
  const totalInvoices = records
    .filter((r) => r.type === "invoice")
    .reduce((sum, r) => sum + Number(r.amount || 0), 0);

  return (
    <div
      style={{
        fontFamily: "Arial, sans-serif",
        maxWidth: "210mm",
        margin: "0 auto",
        backgroundColor: "#fff",
        color: "#000",
      }}
    >
      {/* Header */}
      <table style={{ width: "100%", marginBottom: "5mm" }}>
        <tbody>
          <tr>
            <td style={{ width: "50%", textAlign: "right" }}>
              <h2 style={{ margin: "0", fontSize: "18px", fontWeight: "bold" }}>HISTORIQUE CAISSE</h2>
              <p style={{ margin: "2px 0", fontSize: "11px" }}>Date d'impression: {printDate}</p>
            </td>
          </tr>
        </tbody>
      </table>

      <div style={{ borderTop: "2px solid #333", borderBottom: "2px solid #333", margin: "10mm 0", padding: "5mm 0" }}></div>

      {/* Summary */}
      <div style={{ marginBottom: "10mm", fontSize: "11px" }}>
        <table style={{ width: "100%", marginBottom: "5mm" }}>
          <tbody>
            <tr style={{ backgroundColor: "#f0f0f0" }}>
              <td style={{ padding: "3mm", fontWeight: "bold", borderRight: "1px solid #ddd" }}>
                Total Paiements ({records.filter((r) => r.type === "payment").length})
              </td>
              <td style={{ padding: "3mm", textAlign: "right", fontWeight: "bold", color: "#4caf50" }}>
                {totalPayments.toLocaleString("fr-FR", { minimumFractionDigits: 0 })} CDF
              </td>
            </tr>
            <tr>
              <td style={{ padding: "3mm", fontWeight: "bold", borderRight: "1px solid #ddd" }}>
                Total Factures ({records.filter((r) => r.type === "invoice").length})
              </td>
              <td style={{ padding: "3mm", textAlign: "right", fontWeight: "bold", color: "#ff9800" }}>
                {totalInvoices.toLocaleString("fr-FR", { minimumFractionDigits: 0 })} CDF
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Records Table */}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px", marginBottom: "10mm" }}>
        <thead>
          <tr style={{ backgroundColor: "#f0f0f0", borderBottom: "1px solid #333" }}>
            <th style={{ padding: "3mm", textAlign: "left", borderRight: "1px solid #ddd" }}>Date & Heure</th>
            <th style={{ padding: "3mm", textAlign: "left", borderRight: "1px solid #ddd" }}>Type</th>
            <th style={{ padding: "3mm", textAlign: "left", borderRight: "1px solid #ddd" }}>Patient</th>
            <th style={{ padding: "3mm", textAlign: "left", borderRight: "1px solid #ddd" }}>Entreprise</th>
            <th style={{ padding: "3mm", textAlign: "left", borderRight: "1px solid #ddd" }}>Méthode</th>
            <th style={{ padding: "3mm", textAlign: "left", borderRight: "1px solid #ddd" }}>Référence</th>
            <th style={{ padding: "3mm", textAlign: "right" }}>Montant (FC)</th>
          </tr>
        </thead>
        <tbody>
          {records.length === 0 ? (
            <tr>
              <td colSpan={6} style={{ padding: "3mm", textAlign: "center", color: "#999" }}>
                Aucun historique à afficher
              </td>
            </tr>
          ) : (
            records.map((record) => (
              <tr key={record.id} style={{ borderBottom: "1px solid #ddd" }}>
                <td style={{ padding: "3mm", borderRight: "1px solid #ddd" }}>
                  {new Date(record.createdAt).toLocaleDateString("fr-FR")}
                  <br />
                  {new Date(record.createdAt).toLocaleTimeString("fr-FR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </td>
                <td style={{ padding: "3mm", borderRight: "1px solid #ddd" }}>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "1mm 2mm",
                      borderRadius: "2mm",
                      fontSize: "9px",
                      fontWeight: "bold",
                      backgroundColor: record.type === "payment" ? "#c8e6c9" : "#ffe0b2",
                      color: record.type === "payment" ? "#1b5e20" : "#e65100",
                    }}
                  >
                    {record.type === "payment" ? "PAIEMENT" : "FACTURE"}
                  </span>
                </td>
                <td style={{ padding: "3mm", borderRight: "1px solid #ddd" }}>
                  {record.patientName}
                  {record.patientPhone && <br />}
                  {record.patientPhone && <span style={{ fontSize: "9px", color: "#666" }}>{record.patientPhone}</span>}
                </td>
                <td style={{ padding: "3mm", borderRight: "1px solid #ddd" }}>
                  {record.patientCompany || "—"}
                </td>
                <td style={{ padding: "3mm", borderRight: "1px solid #ddd" }}>
                  {record.method || record.invoiceType || "—"}
                </td>
                <td style={{ padding: "3mm", borderRight: "1px solid #ddd" }}>
                  {record.reference || "—"}
                </td>
                <td style={{ padding: "3mm", textAlign: "right", fontWeight: "bold" }}>
                  {record.amount.toLocaleString("fr-FR", { minimumFractionDigits: 0 })}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* Footer */}
      <div style={{ borderTop: "1px solid #ddd", paddingTop: "5mm", fontSize: "10px", color: "#666", textAlign: "center" }}>
        <p style={{ margin: "0" }}>Imprimé le {printDate} à {new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</p>
        <p style={{ margin: "2mm 0" }}>D7 CLINIC - Tous droits réservés</p>
      </div>

      {/* Print Styles */}
      <style>
        {`
          @media print {
            body { margin: 0; padding: 0; }
            div { page-break-inside: avoid; }
            table { page-break-inside: avoid; }
          }
        `}
      </style>
    </div>
  );
};
