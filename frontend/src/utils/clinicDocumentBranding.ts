import { apiFetch } from "../config/api";

export type ClinicDocumentBranding = {
  name: string;
  legalName?: string | null;
  documentLogoUrl?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  registrationNumber?: string | null;
  rccmNumber?: string | null;
  taxNumber?: string | null;
  nationalIdNumber?: string | null;
  documentFooter?: string | null;
};

const FALLBACK: ClinicDocumentBranding = { name: "Aulia Care" };
let cachedBranding: ClinicDocumentBranding | null = null;

export function invalidateClinicDocumentBrandingCache() {
  cachedBranding = null;
}

/** Loads the hospital identity once per browser session for official documents.
 * A document must remain printable even if the identity endpoint is temporarily unavailable.
 */
export async function getClinicDocumentBranding(): Promise<ClinicDocumentBranding> {
  if (cachedBranding) return cachedBranding;

  try {
    const branding = await apiFetch<Partial<ClinicDocumentBranding>>("/administration/clinic-branding");
    cachedBranding = {
      ...FALLBACK,
      ...branding,
      name: branding.name?.trim() || "Aulia Care",
    };
  } catch {
    cachedBranding = FALLBACK;
  }

  return cachedBranding;
}

export function documentLogoUrl(branding: ClinicDocumentBranding): string {
  const configured = branding.documentLogoUrl?.trim();
  if (!configured) return `${window.location.origin}/images/logo/icone.png`;
  if (/^https?:\/\//i.test(configured)) return configured;
  return `${window.location.origin}${configured.startsWith("/") ? "" : "/"}${configured}`;
}

export function documentIdentityLine(branding: ClinicDocumentBranding): string {
  return [
    branding.address,
    branding.city,
    branding.country,
    branding.phone,
    branding.email,
  ].filter(Boolean).join(" · ");
}

export function documentLegalLine(branding: ClinicDocumentBranding): string {
  return [
    branding.rccmNumber && `RCCM : ${branding.rccmNumber}`,
    branding.taxNumber && `NIF : ${branding.taxNumber}`,
    branding.nationalIdNumber && `ID Nat. : ${branding.nationalIdNumber}`,
    branding.registrationNumber && `N° enregistrement : ${branding.registrationNumber}`,
  ].filter(Boolean).join(" · ");
}

export function escapeDocumentHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
