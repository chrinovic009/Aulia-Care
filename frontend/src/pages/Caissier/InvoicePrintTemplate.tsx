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
  visitItems?: Array<{
    description: string;
    amount: number;
    paidAmount?: number;
    balanceDue?: number;
    status?: string;
    issuedAt?: string;
    invoiceNumber?: string;
  }>;
  visitTotalAmount?: number;
  visitPaidAmount?: number;
  visitBalanceDue?: number;
  visitWorkflowStatus?: string | null;
}

const normalizeText = (value?: string | null) =>
  (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const buildFrenchDescription = (invoiceType: string, remarks?: string) => {
  const normalizedType = normalizeText(invoiceType);
  const normalizedRemarks = normalizeText(remarks);

  if (normalizedType.includes("laboratoire") || normalizedRemarks.includes("laboratoire") || normalizedType.includes("lab")) {
    if (normalizedRemarks.includes("hematologie") || normalizedRemarks.includes("hematologie")) {
      return { label: "Laboratoire", detail: "Examen d'hématologie" };
    }
    if (normalizedRemarks.includes("biochimie") || normalizedRemarks.includes("chimie")) {
      return { label: "Laboratoire", detail: "Analyse biochimique" };
    }
    return { label: "Laboratoire", detail: "Examen de laboratoire" };
  }

  if (normalizedType.includes("pharm") || normalizedRemarks.includes("pharmacie") || normalizedRemarks.includes("medicament")) {
    if (normalizedRemarks.includes("quinine")) {
      return { label: "Pharmacie", detail: "Quinine 300 mg" };
    }
    if (normalizedRemarks.includes("antibiotique")) {
      return { label: "Pharmacie", detail: "Antibiotique" };
    }
    return { label: "Pharmacie", detail: "Médicament" };
  }

  if (normalizedType.includes("radio") || normalizedRemarks.includes("imagerie") || normalizedRemarks.includes("radiologie")) {
    return { label: "Imagerie", detail: "Examen d'imagerie" };
  }

  if (normalizedType.includes("consult") || normalizedRemarks.includes("consultation") || normalizedRemarks.includes("medecin")) {
    return { label: "Consultation", detail: "Consultation médicale" };
  }

  if (normalizedRemarks.includes("hospitalisation") || normalizedRemarks.includes("admission")) {
    return { label: "Admission", detail: "Frais d'admission" };
  }

  return { label: "Service médical", detail: "Prestation clinique" };
};

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
  visitItems,
  visitTotalAmount,
  visitPaidAmount,
  visitBalanceDue,
  visitWorkflowStatus,
}) => {
  const [firstName, ...restNames] = patientName.trim().split(/\s+/);
  const displayInvoiceId = formatInvoiceId(invoicePosition || 1, {
    firstName,
    lastName: restNames[restNames.length - 1] || "",
  });
  const defaultDescription = buildFrenchDescription(invoiceType, remarks);

  return (
    <div
      style={{
        fontFamily: "Arial, sans-serif",
        width: "100%",
        maxWidth: "210mm",
        margin: "0 auto",
        padding: "5mm",
        backgroundColor: "#fff",
        color: "#000",
        pageBreakInside: "avoid",
        breakInside: "avoid",
      }}
    >
      {/* Header */}

      {/* Invoice Title */}
      <div style={{ textAlign: "center", marginBottom: "10mm" }}>
        <h2 style={{ margin: "0", fontSize: "18px", fontWeight: "bold" }}>
          {visitItems ? "FACTURE TOTALE" : "FACTURE"}
        </h2>
        <p style={{ margin: "2mm 0", fontSize: "11px", color: "#666" }}>
          {visitItems
            ? "Résumé des transactions de la visite et état du règlement"
            : `Type: ${invoiceType === "ADMISSION_FEE" ? "Frais d'Admission" : invoiceType}`}
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
      <table style={{ width: "100%", marginBottom: "10mm", borderCollapse: "collapse", fontSize: "11px", pageBreakInside: "avoid" }}>
        <thead>
          <tr style={{ backgroundColor: "#f0f0f0", borderBottom: "1px solid #333" }}>
            <th style={{ padding: "4mm", textAlign: "left", borderRight: "1px solid #ddd" }}>Description</th>
            <th style={{ padding: "4mm", textAlign: "right" }}>Montant (CDF)</th>
          </tr>
        </thead>
        <tbody>
          {visitItems && visitItems.length > 0 ? (
            visitItems.map((item, index) => {
              const description = item.description || `${defaultDescription.label} (${defaultDescription.detail})`;
              const descriptionLines = description.split("||");
              return (
                <tr key={`${item.description}-${index}`} style={{ borderBottom: "1px solid #ddd", pageBreakInside: "avoid" }}>
                  <td style={{ padding: "4mm", borderRight: "1px solid #ddd" }}>
                    <div style={{ fontWeight: 600 }}>{descriptionLines[0] || description}</div>
                    {descriptionLines[1] ? <div style={{ marginTop: "1mm", color: "#6b7280", fontSize: "10px" }}>{descriptionLines[1]}</div> : null}
                    {item.invoiceNumber ? <div style={{ marginTop: "1mm", color: "#6b7280", fontSize: "10px" }}>Référence: {item.invoiceNumber}</div> : null}
                  </td>
                  <td style={{ padding: "4mm", textAlign: "right", fontWeight: "bold" }}>
                    {Number(item.amount || 0).toLocaleString("fr-FR", { minimumFractionDigits: 0 })}
                  </td>
                </tr>
              );
            })
          ) : (
            <tr style={{ borderBottom: "1px solid #ddd", pageBreakInside: "avoid" }}>
              <td style={{ padding: "4mm", borderRight: "1px solid #ddd" }}>
                <div style={{ fontWeight: 600 }}>{defaultDescription.label}</div>
                <div style={{ marginTop: "1mm", color: "#6b7280", fontSize: "10px" }}>{defaultDescription.detail}</div>
              </td>
              <td style={{ padding: "4mm", textAlign: "right", fontWeight: "bold" }}>
                {totalAmount.toLocaleString("fr-FR", { minimumFractionDigits: 0 })}
              </td>
            </tr>
          )}
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
                {(visitItems ? visitTotalAmount ?? totalAmount : totalAmount).toLocaleString("fr-FR", { minimumFractionDigits: 0 })} FC
              </td>
            </tr>
            <tr>
              <td style={{ paddingRight: "10mm", paddingBottom: "3mm" }}>
                <strong>Déjà payé:</strong>
              </td>
              <td style={{ textAlign: "right", paddingBottom: "3mm", fontWeight: "bold", fontSize: "12px", color: "#2e7d32" }}>
                {(visitItems ? visitPaidAmount ?? 0 : Math.max(totalAmount - balanceDue, 0)).toLocaleString("fr-FR", { minimumFractionDigits: 0 })} FC
              </td>
            </tr>
            <tr>
              <td style={{ paddingRight: "10mm", paddingBottom: "3mm" }}>
                <strong>Reste à payer:</strong>
              </td>
              <td
                style={{
                  textAlign: "right",
                  paddingBottom: "3mm",
                  fontWeight: "bold",
                  fontSize: "12px",
                  color: (visitItems ? visitBalanceDue ?? balanceDue : balanceDue) > 0 ? "#d32f2f" : "#4caf50",
                }}
              >
                {(visitItems ? visitBalanceDue ?? balanceDue : balanceDue).toLocaleString("fr-FR", { minimumFractionDigits: 0 })} FC
              </td>
            </tr>
            <tr>
              <td style={{ paddingRight: "10mm", paddingBottom: "3mm" }}>
                <strong>État visite:</strong>
              </td>
              <td style={{ textAlign: "right", paddingBottom: "3mm", fontWeight: "bold", fontSize: "12px" }}>
                {visitWorkflowStatus === "TERMINE" ? "Clôturée" : "En cours"}
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
                {visitItems
                  ? ((visitBalanceDue ?? balanceDue) > 0 ? ((visitPaidAmount ?? 0) > 0 ? "PARTIELLEMENT PAYÉE" : "EN ATTENTE") : "PAYÉE")
                  : status === "PAID"
                    ? "PAYÉE"
                    : status === "PENDING"
                      ? "EN ATTENTE"
                      : status === "PARTIALLY_PAID"
                        ? "PARTIELLEMENT PAYÉE"
                        : status}
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
          @page { size: A4; margin: 8mm; }
          @media print {
            body { margin: 0 !important; padding: 0 !important; }
            div, table, tr, td, th, thead, tbody, tfoot, p, h1, h2, h3 {
              break-inside: avoid;
              page-break-inside: avoid;
            }
          }
        `}
      </style>
    </div>
  );
};
