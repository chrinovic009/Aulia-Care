export type FormatIdOptions = {
  placeholder?: string;
  truncateTo?: number;
  position?: number;
};

/**
 * Display-only ID formatting helper.
 * Prefer the human-facing ID when available, otherwise fall back to the raw identifier.
 * If the raw identifier is used and a position is available, show the list position instead of exposing the UUID.
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
    return options.placeholder ?? "—";
  }

  if (trimmedDisplayId) {
    return trimmedDisplayId;
  }

  const position = typeof options.position === "number" && options.position > 0 ? options.position : undefined;
  if (position) {
    return `#${position}`;
  }

  if (typeof options.truncateTo === "number" && value.length > options.truncateTo) {
    return value.slice(0, options.truncateTo);
  }

  return value;
};

export const formatPatientDossierId = (
  rawId?: string | null,
  externalId?: string | null,
  options: FormatIdOptions = {},
): string => formatDisplayId(rawId, externalId, options);

export const formatInvoiceReference = (
  rawInvoiceId?: string | null,
  invoiceNumber?: string | null,
  options: FormatIdOptions = {},
): string => formatDisplayId(rawInvoiceId, invoiceNumber, options);
