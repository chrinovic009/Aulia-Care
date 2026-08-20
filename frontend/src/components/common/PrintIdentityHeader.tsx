import { useEffect, useState } from "react";
import { documentIdentityLine, documentLegalLine, documentLogoUrl, getClinicDocumentBranding, type ClinicDocumentBranding } from "../../utils/clinicDocumentBranding";

/** Print-only official header for documents rendered directly from a page. */
export function PrintIdentityHeader({ title }: { title: string }) {
  const [clinic, setClinic] = useState<ClinicDocumentBranding | null>(null);
  useEffect(() => { void getClinicDocumentBranding().then(setClinic); }, []);
  if (!clinic) return null;
  const identity = documentIdentityLine(clinic);
  const legal = documentLegalLine(clinic);
  return <header className="aulia-print-identity"><div><img src={documentLogoUrl(clinic)} alt="Logo de l’établissement"/><div><h1>{clinic.name}</h1>{identity && <p>{identity}</p>}{legal && <p>{legal}</p>}</div></div><strong>{title}</strong></header>;
}
