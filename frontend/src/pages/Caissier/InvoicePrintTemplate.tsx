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
  clinicEmail?: string;
  invoiceId: string;
  invoicePosition?: number;
  invoiceLines?: Array<{
    id: string;
    label: string;
    quantity: number;
    unitPrice: number;
    totalAmount: number;
  }>;
  payments?: Array<{
    id: string;
    amount: number;
    method: string;
    paidAt: string;
    reference?: string;
  }>;
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
  invoiceNumber,
  invoiceType,
  totalAmount,
  balanceDue,
  status,
  issuedAt,
  dueDate,
  remarks,
  clinicName,
  clinicAddress,
  clinicPhone,
  clinicEmail,
  invoicePosition,
  visitItems,
  visitTotalAmount,
  visitPaidAmount,
  visitBalanceDue,
  visitWorkflowStatus,
}) => {
  const [firstName, ...restNames] = patientName.trim().split(/\s+/);
  const displayInvoiceId = invoiceNumber || formatInvoiceId(invoicePosition || 1, {
    firstName,
    lastName: restNames[restNames.length - 1] || "",
  });
  const defaultDescription = buildFrenchDescription(invoiceType, remarks);
  const headlineType = visitItems ? "FACTURE TOTALE" : "FACTURE";
  const invoiceTypeLabel = invoiceType === "ADMISSION_FEE" ? "Frais d'Admission" : invoiceType;
  const clinicDisplayName = clinicName || "D7 Clinique";
  const clinicDisplayAddress = clinicAddress || "Zone de santé, Dilala";
  const clinicDisplayPhone = clinicPhone || "+243 987 299 227";
  const clinicDisplayEmail = clinicEmail || "fondationd7clinic@gmail.com";

  return (
    <div
      style={{
        fontFamily: "Arial, sans-serif",
        width: "100%",
        maxWidth: "210mm",
        margin: "0 auto",
        padding: "8mm",
        backgroundColor: "#fff",
        color: "#000",
        pageBreakInside: "avoid",
        breakInside: "avoid",
      }}
    >
      {/* Header similar to template */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8mm" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ width: 72, height: 72, background: "#0f172a", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6 }}>
            <img src="/images/favicon.png" alt="logo" style={{ width: 40, height: 40 }} />
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#0f172a" }}>{clinicDisplayName}</div>
            <div style={{ fontSize: 11, color: "#6b7280", lineHeight: 1.4 }}>{clinicDisplayAddress}</div>
            <div style={{ fontSize: 11, color: "#6b7280" }}>Tel: {clinicDisplayPhone} | {clinicDisplayEmail}</div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ background: "#0f172a", color: "#fff", padding: "10px 14px", borderRadius: 6, minWidth: 200 }}>
            <div style={{ fontSize: 12, opacity: 0.9 }}>N° DOCUMENT</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{displayInvoiceId}</div>
            <div style={{ marginTop: 6, fontSize: 11, opacity: 0.85 }}>DATE {new Date(issuedAt).toLocaleDateString("fr-FR")}</div>
          </div>
        </div>
      </div>

      {/* Invoice Details (Invoice To / Invoice To layout) */}
      <div style={{ display: "flex", gap: "12px", marginBottom: "10mm" }}>
        <div style={{ flex: 1, border: "1px solid #eee", padding: "8px" }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: "#0f172a" }}>PATIENT</div>
          <div style={{ marginTop: 6, fontSize: 11, fontWeight: 700 }}>{patientName}</div>
          <div style={{ fontSize: 11, color: "#6b7280" }}>{patientPhone || "-"}</div>
          <div style={{ fontSize: 11, color: "#6b7280" }}>{patientEmail || "-"}</div>
        </div>
        <div style={{ flex: 1, border: "1px solid #eee", padding: "8px" }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: "#0f172a" }}>ÉTABLISSEMENT ÉMETTEUR</div>
          <div style={{ marginTop: 6, fontSize: 11, fontWeight: 700 }}>{clinicDisplayName}</div>
          <div style={{ fontSize: 11, color: "#6b7280" }}>{clinicDisplayAddress}</div>
          <div style={{ fontSize: 11, color: "#6b7280" }}>Tel: {clinicDisplayPhone}</div>
        </div>
      </div>

      <table style={{ width: "100%", marginBottom: "6mm", fontSize: "11px" }}>
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
              <strong>Type de facture:</strong>
            </td>
            <td style={{ paddingBottom: "3mm", textAlign: "right" }}>
              {invoiceTypeLabel}
            </td>
          </tr>
          <tr>
            <td style={{ paddingBottom: "3mm" }}>
              <strong>Statut:</strong>
            </td>
            <td style={{ paddingBottom: "3mm", textAlign: "right" }}>
              {status}
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

      {/* Invoice Items: prefer invoiceLines (detailed), else visitItems */}
      <table style={{ width: "100%", marginBottom: "10mm", borderCollapse: "collapse", fontSize: "11px", pageBreakInside: "avoid" }}>
        <thead>
          <tr style={{ backgroundColor: "#0f172a", color: "#fff" }}>
            <th style={{ padding: "10px", textAlign: "left" }}>DESCRIPTION</th>
            <th style={{ padding: "10px", textAlign: "center", width: 80 }}>QTY</th>
            <th style={{ padding: "10px", textAlign: "right", width: 120 }}>PRIX (CDF)</th>
            <th style={{ padding: "10px", textAlign: "right", width: 120 }}>TOTAL (CDF)</th>
          </tr>
        </thead>
        <tbody>
          {invoiceLines && invoiceLines.length > 0 ? (
            invoiceLines.map((line) => (
              <tr key={line.id} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: "8px" }}>{line.label}</td>
                <td style={{ padding: "8px", textAlign: "center" }}>{line.quantity ?? 1}</td>
                <td style={{ padding: "8px", textAlign: "right" }}>{Number(line.unitPrice || 0).toLocaleString("fr-FR", { minimumFractionDigits: 0 })} CDF</td>
                <td style={{ padding: "8px", textAlign: "right", fontWeight: 700 }}>{Number(line.totalAmount || (line.unitPrice * (line.quantity || 1))).toLocaleString("fr-FR", { minimumFractionDigits: 0 })} CDF</td>
              </tr>
            ))
          ) : visitItems && visitItems.length > 0 ? (
            visitItems.map((item, index) => (
              <tr key={`${item.description}-${index}`} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: "8px" }}>{(item.description || defaultDescription.label).split("||")[0]}</td>
                <td style={{ padding: "8px", textAlign: "center" }}>1</td>
                <td style={{ padding: "8px", textAlign: "right" }}>{Number(item.amount || 0).toLocaleString("fr-FR", { minimumFractionDigits: 0 })} CDF</td>
                <td style={{ padding: "8px", textAlign: "right", fontWeight: 700 }}>{Number(item.amount || 0).toLocaleString("fr-FR", { minimumFractionDigits: 0 })} CDF</td>
              </tr>
            ))
          ) : (
            <tr style={{ borderBottom: "1px solid #eee" }}>
              <td style={{ padding: "8px" }}>{defaultDescription.label}</td>
              <td style={{ padding: "8px", textAlign: "center" }}>1</td>
              <td style={{ padding: "8px", textAlign: "right" }}>{totalAmount.toLocaleString("fr-FR", { minimumFractionDigits: 0 })} CDF</td>
              <td style={{ padding: "8px", textAlign: "right", fontWeight: 700 }}>{totalAmount.toLocaleString("fr-FR", { minimumFractionDigits: 0 })} CDF</td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Totals */}
      {/* Totals and payment method */}
      <div style={{ display: "flex", gap: "12px", alignItems: "flex-start", marginBottom: "14mm" }}>
        <div style={{ flex: 1 }}>
          <div style={{ border: "1px solid #eee", padding: "10px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>PAYMENT METHOD</div>
            {payments && payments.length > 0 ? (
              payments.map((p) => (
                <div key={p.id} style={{ fontSize: 11, color: "#374151", marginBottom: 4 }}>
                  {p.method} — {Number(p.amount).toLocaleString("fr-FR")} CDF {p.reference ? `(${p.reference})` : ""}
                </div>
              ))
            ) : (
              <div style={{ fontSize: 11, color: "#6b7280" }}>Cash / Carte / Virement</div>
            )}
          </div>
        </div>
        <div style={{ width: 320 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div style={{ fontSize: 12 }}>Subtotal</div>
            <div style={{ fontWeight: 700 }}>{(visitItems ? visitTotalAmount ?? totalAmount : totalAmount).toLocaleString("fr-FR")} CDF</div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div style={{ fontSize: 12 }}>Tax</div>
            <div style={{ fontWeight: 700 }}>0 CDF</div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fbbf24", padding: "10px", borderRadius: 6 }}>
            <div style={{ fontSize: 14, fontWeight: 800 }}>TOTAL À PAYER</div>
            <div style={{ fontSize: 16, fontWeight: 900 }}>{(visitItems ? visitTotalAmount ?? totalAmount : totalAmount).toLocaleString("fr-FR")} CDF</div>
          </div>
        </div>
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
