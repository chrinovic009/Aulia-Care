import { PropsWithChildren, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

type RealtimePayload = { model?: string };

const domainForPath = (pathname: string) => {
  if (pathname.startsWith("/reception")) return "reception";
  if (pathname.startsWith("/laboratoire")) return "laboratory";
  if (pathname.startsWith("/radiologie")) return "radiology";
  if (pathname.startsWith("/pharmacie")) return "pharmacy";
  if (pathname.startsWith("/caissier") || pathname.startsWith("/finance")) return "billing";
  if (pathname.startsWith("/administration") || pathname.startsWith("/admin")) return "administration";
  if (pathname.startsWith("/doctor") || pathname.startsWith("/nurse")) return "clinical";
  return "patient";
};

const domainForModel = (model?: string) => {
  if (["LabRequest", "LabRequestItem", "LabResult", "LabSample", "LabReport"].includes(model || "")) return "laboratory";
  if (["ImagingRequest", "ImagingReport", "ImagingCatalogue", "ImagingEquipment"].includes(model || "")) return "radiology";
  if (["Prescription", "PharmacyDispense", "Medication", "MedicationStock", "StockLot", "StockTransaction"].includes(model || "")) return "pharmacy";
  if (["Invoice", "InvoiceLine", "Payment", "Revenue", "Expense", "CashRegister", "InvoiceDiscountRequest"].includes(model || "")) return "billing";
  if (["Patient", "PatientVisit", "Appointment"].includes(model || "")) return "reception";
  if (["Consultation", "Hospitalization", "VitalSign", "NursingCareTask", "MedicationAdministration", "Surgery"].includes(model || "")) return "clinical";
  return "administration";
};

const hasActiveClinicalEntry = () => {
  const active = document.activeElement;
  return active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement;
};

/**
 * Makes every route data-fresh without broadcasting data across users. A form
 * being edited is never remounted automatically; the user explicitly chooses
 * when to refresh it.
 */
export default function RealtimePageBoundary({ children }: PropsWithChildren) {
  const { pathname } = useLocation();
  const [revision, setRevision] = useState(0);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const onUpdate = (event: Event) => {
      const payload = (event as CustomEvent<RealtimePayload>).detail;
      const pageDomain = domainForPath(pathname);
      const changeDomain = domainForModel(payload?.model);
      const patientPage = pageDomain === "patient";
      if (!patientPage && pageDomain !== changeDomain) return;
      if (hasActiveClinicalEntry()) {
        setPending(true);
        return;
      }
      setRevision((value) => value + 1);
    };
    window.addEventListener("aulia:realtime:update", onUpdate);
    return () => window.removeEventListener("aulia:realtime:update", onUpdate);
  }, [pathname]);

  return (
    <>
      {pending && (
        <div className="sticky top-2 z-40 mx-auto mb-3 flex max-w-2xl items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 shadow-sm">
          <span>Des données autorisées ont été mises à jour. Votre saisie en cours est conservée.</span>
          <button type="button" onClick={() => { setPending(false); setRevision((value) => value + 1); }} className="rounded-lg bg-sky-700 px-3 py-1.5 font-semibold text-white">Actualiser</button>
        </div>
      )}
      <div key={revision}>{children}</div>
    </>
  );
}
