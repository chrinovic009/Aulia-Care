export type FormatIdOptions = {
  placeholder?: string;
  truncateTo?: number;
  position?: number;
  firstName?: string | null;
  lastName?: string | null;
};

export type DisplayIdSuffix = "DOS" | "PRES" | "FAC" | "EXAM" | "SERV" | "CONS";

export type DisplayIdPerson = {
  firstName?: string | null;
  lastName?: string | null;
  patient?: {
    firstName?: string | null;
    lastName?: string | null;
  } | null;
};

/**
 * Display-only ID formatting helper.
 * Prefer the human-facing ID when available, otherwise fall back to the raw identifier.
 */
export const formatDisplayId = (
  rawId?: string | null,
  displayId?: string | null,
  options: FormatIdOptions = {},
): string => {
  const trimmedDisplayId = displayId?.trim();
  const trimmedRawId = rawId?.trim();
  const value = trimmedDisplayId || trimmedRawId || "";
  if (!value) {
    return options.placeholder ?? "-";
  }

  if (typeof options.truncateTo === "number" && !trimmedDisplayId && value.length > options.truncateTo) {
    return value.slice(0, options.truncateTo);
  }

  return value;
};

const normalizeLetter = (value?: string | null): string => {
  const letter = value?.trim()?.[0] || "X";
  return letter.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
};

export const getPersonInitials = (person?: DisplayIdPerson | null): string => {
  const firstName = person?.firstName ?? person?.patient?.firstName;
  const lastName = person?.lastName ?? person?.patient?.lastName;
  return `${normalizeLetter(firstName)}${normalizeLetter(lastName)}`;
};

export const formatSemanticId = (
  position: number | string | undefined | null,
  suffix: DisplayIdSuffix,
  person?: DisplayIdPerson | null,
  options: FormatIdOptions = {},
): string => {
  const numericPosition = Number(position);
  if (!Number.isFinite(numericPosition) || numericPosition <= 0) {
    return options.placeholder ?? "-";
  }
  return `${numericPosition}${getPersonInitials(person)}-${suffix}`;
};

export const formatPatientDossierId = (
  rawId?: string | null,
  externalId?: string | null,
  options: FormatIdOptions = {},
): string => options.position
  ? formatDossierId(options.position, { firstName: options.firstName, lastName: options.lastName })
  : formatDisplayId(rawId, externalId, options);

export const formatInvoiceReference = (
  rawInvoiceId?: string | null,
  invoiceNumber?: string | null,
  options: FormatIdOptions = {},
): string => options.position
  ? formatInvoiceId(options.position, { firstName: options.firstName, lastName: options.lastName })
  : formatDisplayId(rawInvoiceId, invoiceNumber, options);

export const formatDossierId = (position: number, patient?: DisplayIdPerson | null) =>
  formatSemanticId(position, "DOS", patient);

export const formatPrescriptionId = (position: number, patient?: DisplayIdPerson | null) =>
  formatSemanticId(position, "PRES", patient);

export const formatInvoiceId = (position: number, patient?: DisplayIdPerson | null) =>
  formatSemanticId(position, "FAC", patient);

export const formatExamRequestId = (position: number, patient?: DisplayIdPerson | null) =>
  formatSemanticId(position, "EXAM", patient);

export const formatServiceId = (position: number, patient?: DisplayIdPerson | null) =>
  formatSemanticId(position, "SERV", patient);

export const formatConsultationId = (position: number, patient?: DisplayIdPerson | null) =>
  formatSemanticId(position, "CONS", patient);
