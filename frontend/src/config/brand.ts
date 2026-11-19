// Single source for brand values used outside Tailwind classes:
// chart libraries and printed documents opened in a separate window.
export const BRAND_FONT = '"Manrope", "Segoe UI", Arial, sans-serif';
export const BRAND_PRINT_FONT_CSS = `font-family: ${BRAND_FONT}`;
export const BRAND_COLORS = {
  primary: "#0d9488",
  primaryDark: "#087c73",
  navy: "#0a1d3a",
  ink: "#111827",
  muted: "#64748b",
  border: "#e2e8f0",
} as const;
