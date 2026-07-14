import React from "react";
import { formatInvoiceId } from "../../utils/formatId";

interface InvoicePrintProps {
  patientName: string;
  patientPhone?: string;
  patientEmail?: string;
  invoiceNumber?: string;
  invoiceType: string;
  totalAmount: number;
  balanceDue: number;
  status: string;
  issuedAt: string;
  dueDate: string;
  remarks?: string;
  clinicName?: string;
  clinicAddress?: string;
  clinicPhone?: string;
  invoiceId: string;
  invoicePosition?: number;
}

export const InvoicePrintTemplate: React.FC<InvoicePrintProps> = ({
  patientName,
  patientPhone,
  patientEmail,
  invoiceType,
  totalAmount,
  balanceDue,
  status,
  issuedAt,
  dueDate,
  remarks,
  invoicePosition,
}) => {
  const [firstName, ...restNames] = patientName.trim().split(/\s+/);
  const displayInvoiceId = formatInvoiceId(invoicePosition || 1, {
    firstName,
    lastName: restNames[restNames.length - 1] || "",
  });

  return (
    <div
      style={{
        fontFamily: "Arial, sans-serif",
        maxWidth: "210mm",
        margin: "0 auto",
        padding: "5mm",
        backgroundColor: "#fff",
        color: "#000",
      }}
    >
      {/* Header */}

      {/* Invoice Title */}
      <div style={{ textAlign: "center", marginBottom: "10mm" }}>
        <h2 style={{ margin: "0", fontSize: "18px", fontWeight: "bold" }}>FACTURE</h2>
        <p style={{ margin: "2mm 0", fontSize: "11px", color: "#666" }}>
          Type: {invoiceType === "ADMISSION_FEE" ? "Frais d'Admission" : invoiceType}
        </p>
      </div>

      {/* Invoice Details */}
      <table style={{ width: "100%", marginBottom: "10mm", fontSize: "11px" }}>
        <tbody>
          <tr>
            <td style={{ paddingBottom: "3mm" }}>
              <strong>Numéro de facture:</strong>
            </td>
            <td style={{ paddingBottom: "3mm", textAlign: "right" }}>
              {displayInvoiceId}
            </td>
          </tr>
          <tr>
            <td style={{ paddingBottom: "3mm" }}>
              <strong>Date d'émission:</strong>
            </td>
            <td style={{ paddingBottom: "3mm", textAlign: "right" }}>
              {new Date(issuedAt).toLocaleDateString("fr-FR")}
            </td>
          </tr>
          <tr>
            <td style={{ paddingBottom: "3mm" }}>
              <strong>Date d'échéance:</strong>
            </td>
            <td style={{ paddingBottom: "3mm", textAlign: "right" }}>
              {new Date(dueDate).toLocaleDateString("fr-FR")}
            </td>
          </tr>
          <tr>
            <td colSpan={2} style={{ height: "5mm" }}></td>
          </tr>
        </tbody>
      </table>

      {/* Patient Information */}
      <div style={{ marginBottom: "10mm" }}>
        <h3 style={{ margin: "0 0 3mm 0", fontSize: "11px", fontWeight: "bold", textDecoration: "underline" }}>
          PATIENT
        </h3>
        <table style={{ width: "100%", fontSize: "11px" }}>
          <tbody>
            <tr>
              <td style={{ paddingBottom: "2mm" }}>
                <strong>Nom:</strong>
              </td>
              <td style={{ paddingBottom: "2mm" }}>{patientName}</td>
            </tr>
            <tr>
              <td style={{ paddingBottom: "2mm" }}>
                <strong>Téléphone:</strong>
              </td>
              <td style={{ paddingBottom: "2mm" }}>{patientPhone || "-"}</td>
            </tr>
            <tr>
              <td style={{ paddingBottom: "2mm" }}>
                <strong>Email:</strong>
              </td>
              <td style={{ paddingBottom: "2mm" }}>{patientEmail || "-"}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Invoice Items */}
      <table style={{ width: "100%", marginBottom: "10mm", borderCollapse: "collapse", fontSize: "11px" }}>
        <thead>
          <tr style={{ backgroundColor: "#f0f0f0", borderBottom: "1px solid #333" }}>
            <th style={{ padding: "4mm", textAlign: "left", borderRight: "1px solid #ddd" }}>Description</th>
            <th style={{ padding: "4mm", textAlign: "right" }}>Montant (CDF)</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: "1px solid #ddd" }}>
            <td style={{ padding: "4mm", borderRight: "1px solid #ddd" }}>
              {invoiceType === "ADMISSION_FEE" ? "Frais de fiche d'admission" : invoiceType}
            </td>
            <td style={{ padding: "4mm", textAlign: "right", fontWeight: "bold" }}>
              {totalAmount.toLocaleString("fr-FR", { minimumFractionDigits: 0 })}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Totals */}
      <div style={{ marginBottom: "10mm", fontSize: "11px" }}>
        <table style={{ width: "300px", marginLeft: "auto", marginRight: "0" }}>
          <tbody>
            <tr>
              <td style={{ paddingRight: "10mm", paddingBottom: "3mm" }}>
                <strong>Total:</strong>
              </td>
              <td style={{ textAlign: "right", paddingBottom: "3mm", fontWeight: "bold", fontSize: "12px" }}>
                {totalAmount.toLocaleString("fr-FR", { minimumFractionDigits: 0 })} FC
              </td>
            </tr>
            <tr>
              <td style={{ paddingRight: "10mm", paddingBottom: "3mm" }}>
                <strong>Solde dû:</strong>
              </td>
              <td
                style={{
                  textAlign: "right",
                  paddingBottom: "3mm",
                  fontWeight: "bold",
                  fontSize: "12px",
                  color: balanceDue > 0 ? "#d32f2f" : "#4caf50",
                }}
              >
                {balanceDue.toLocaleString("fr-FR", { minimumFractionDigits: 0 })} FC
              </td>
            </tr>
            <tr>
              <td colSpan={2} style={{ height: "3mm" }}></td>
            </tr>
            <tr style={{ borderTop: "2px solid #333" }}>
              <td style={{ paddingRight: "10mm", paddingTop: "3mm" }}>
                <strong>Statut:</strong>
              </td>
              <td style={{ textAlign: "right", paddingTop: "3mm", fontWeight: "bold" }}>
                {status === "PAID" ? "PAYÉE" : status === "PENDING" ? "EN ATTENTE" : status === "PARTIALLY_PAID" ? "PARTIELLEMENT PAYÉE" : status}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Remarks */}
      {remarks && (
        <div style={{ marginBottom: "10mm", fontSize: "10px", borderTop: "1px solid #ddd", paddingTop: "5mm" }}>
          <strong>Remarques:</strong>
          <p style={{ margin: "2mm 0", whiteSpace: "pre-wrap" }}>{remarks}</p>
        </div>
      )}

      {/* Footer */}
      <div style={{ marginTop: "15mm", textAlign: "center", fontSize: "10px", color: "#666", borderTop: "1px solid #ddd", paddingTop: "5mm" }}>
        <p style={{ margin: "0" }}>Merci de votre confiance</p>
        <p style={{ margin: "2mm 0" }}>D7 CLINIC - Tous droits réservés</p>
        <p style={{ margin: "2mm 0", color: "#999" }}>Facture n° {displayInvoiceId}</p>
      </div>

      {/* Print Styles */}
      <style>
        {`
          @media print {
            body { margin: 0; padding: 0; }
            div { page-break-inside: avoid; }
          }
        `}
      </style>
    </div>
  );
};
