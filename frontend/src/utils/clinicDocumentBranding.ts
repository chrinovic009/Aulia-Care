import { apiFetch } from "../config/api";

export type ClinicDocumentBranding = {
  name: string;
  brandDisplayName?: string | null;
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

const FALLBACK: ClinicDocumentBranding = {
  name: "Aulia Care",
};

let cachedBranding: ClinicDocumentBranding | null = null;

const CACHE_KEY = "aulia:clinic-document-branding";

function normaliseBranding(
  branding?: Partial<ClinicDocumentBranding> | null,
): ClinicDocumentBranding {
  return {
    ...FALLBACK,
    ...branding,
    name:
      branding?.brandDisplayName?.trim() ||
      branding?.name?.trim() ||
      "Aulia Care",
  };
}

function readBrowserCache(): ClinicDocumentBranding | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    return raw ? normaliseBranding(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function setClinicDocumentBrandingCache(
  branding: Partial<ClinicDocumentBranding>,
) {
  cachedBranding = normaliseBranding(branding);

  try {
    window.localStorage.setItem(
      CACHE_KEY,
      JSON.stringify(cachedBranding),
    );
  } catch {
    // Printing still works when browser storage is unavailable.
  }

  return cachedBranding;
}

export function invalidateClinicDocumentBrandingCache() {
  cachedBranding = null;

  try {
    window.localStorage.removeItem(CACHE_KEY);
  } catch {
    // no-op
  }
}

/**
 * Loads the hospital identity once per browser session for official documents.
 * A document must remain printable even if the identity endpoint is
 * temporarily unavailable.
 */
export async function getClinicDocumentBranding(): Promise<ClinicDocumentBranding> {
  if (cachedBranding) {
    return cachedBranding;
  }

  const storedBranding = readBrowserCache();

  if (storedBranding) {
    cachedBranding = storedBranding;
  }

  try {
    const branding = await apiFetch<
      Partial<ClinicDocumentBranding>
    >("/administration/clinic-branding");

    cachedBranding = setClinicDocumentBrandingCache(branding);
  } catch {
    cachedBranding = storedBranding || FALLBACK;
  }

  return cachedBranding;
}

/**
 * Resolves the logo used on official clinic documents.
 *
 * Supported sources:
 * - PNG Base64
 * - JPG/JPEG Base64
 * - WEBP Base64
 * - Absolute HTTP/HTTPS URLs
 * - Application-relative paths
 *
 * When no clinic logo is configured, the Aulia Care icon is used.
 */
export function documentLogoUrl(
  branding: ClinicDocumentBranding,
): string {
  const configured = branding.documentLogoUrl?.trim();

  if (!configured) {
    return `${window.location.origin}/images/logo/icone.png`;
  }

  // Logo stored directly as an image Data URL.
  // Examples:
  // data:image/png;base64,...
  // data:image/jpeg;base64,...
  // data:image/jpg;base64,...
  // data:image/webp;base64,...
  if (/^data:image\/(?:png|jpe?g|webp);base64,/i.test(configured)) {
    return configured;
  }

  // Absolute remote/local HTTP(S) URL.
  if (/^https?:\/\//i.test(configured)) {
    return configured;
  }

  // Application-relative path.
  // Examples:
  // /uploads/clinics/logo.png
  // images/clinic/logo.webp
  return `${window.location.origin}${
    configured.startsWith("/") ? "" : "/"
  }${configured}`;
}

export function documentIdentityLine(
  branding: ClinicDocumentBranding,
): string {
  return [
    branding.address,
    branding.city,
    branding.country,
    branding.phone,
    branding.email,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function documentLegalLine(
  branding: ClinicDocumentBranding,
): string {
  return [
    branding.rccmNumber && `RCCM : ${branding.rccmNumber}`,
    branding.taxNumber && `NIF : ${branding.taxNumber}`,
    branding.nationalIdNumber &&
      `ID Nat. : ${branding.nationalIdNumber}`,
    branding.registrationNumber &&
      `N° enregistrement : ${branding.registrationNumber}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function escapeDocumentHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}