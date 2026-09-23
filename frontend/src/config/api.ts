/**
 * Centralized API configuration
 * All API endpoints and base URLs are defined here.
 */

export const API_CONFIG = {
  // Base URL for the API backend
  BASE_URL: import.meta.env.VITE_API_BASE_URL || "/api",

  // Authentication endpoints
  AUTH: {
    LOGIN: "/auth/login",
    REFRESH: "/auth/refresh",
    ME: "/auth/me",
    LOGOUT: "/auth/logout",
  },

  // Patient endpoints - PROTECTED (auth required)
  PATIENTS: {
    GET_ALL: "/patients",
    SEARCH: "/patients/search",
    GET_BY_ID: (id: string) => `/patients/${id}`,
    CREATE: "/patients",
    UPDATE: (id: string) => `/patients/${id}`,
    DELETE: (id: string) => `/patients/${id}`,
    CREATE_ADMISSION: "/patients/admissions",
  },

  // Nurse endpoints
  NURSE: {
    AWAITING_VITALS: "/patients/nurse/awaiting-vitals",
    ORIENTATION_HISTORY: "/patients/nurse/orientation-history",
    RECORD_VITAL_SIGNS: (patientId: string) =>
      `/patients/${patientId}/vital-signs`,
  },

  // Appointment endpoints
  APPOINTMENTS: {
    GET_ALL: "/appointments",
    GET_BY_ID: (id: string) => `/appointments/${id}`,
    CREATE: "/appointments",
    UPDATE: (id: string) => `/appointments/${id}`,
    DELETE: (id: string) => `/appointments/${id}`,
  },

  // Hospitalization endpoints
  HOSPITALIZATIONS: {
    GET_ALL: "/hospitalizations",
    GET_BY_ID: (id: string) => `/hospitalizations/${id}`,
    CREATE: "/hospitalizations",
    UPDATE: (id: string) => `/hospitalizations/${id}`,
    DELETE: (id: string) => `/hospitalizations/${id}`,
  },

  // Consultation endpoints
  CONSULTATIONS: {
    GET_ALL: "/consultations",
    GET_BY_ID: (id: string) => `/consultations/${id}`,
    CREATE: "/consultations",
    UPDATE: (id: string) => `/consultations/${id}`,
    DELETE: (id: string) => `/consultations/${id}`,
  },

  // Billing/Payment endpoints
  BILLING: {
    PAYMENTS: "/payments",
    INVOICES: "/billing/invoices",
    CREATE_PAYMENT: "/payments",
  },

  // Notification endpoints
  NOTIFICATIONS: {
    GET_ALL: "/notifications",
    MARK_AS_READ: (id: string) => `/notifications/${id}/read`,
  },
};

/**
 * Build full URL from endpoint.
 */
export const buildUrl = (endpoint: string): string => {
  const baseUrl = API_CONFIG.BASE_URL.replace(/\/+$/, "");
  const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;

  return `${baseUrl}${path}`;
};

const getCookie = (name: string): string | null => {
  if (typeof document === "undefined") {
    return null;
  }

  const prefix = `${name}=`;

  return (
    document.cookie
      .split(";")
      .map((value) => value.trim())
      .find((value) => value.startsWith(prefix))
      ?.slice(prefix.length) ?? null
  );
};

// Access tokens are deliberately never exposed to JavaScript.
// This function is retained only for compatibility with callers
// that previously read localStorage.
export const getAuthToken = (): string | null => null;

/**
 * Adds the non-sensitive CSRF value required for
 * cookie-authenticated writes.
 */
export const getAuthHeaders = (): Record<string, string> => {
  const csrfToken = getCookie("aulia_csrf_token");

  return csrfToken
    ? {
        "X-CSRF-Token": csrfToken,
      }
    : {};
};

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public statusText: string,
    public body: any,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const reportApiFailure = (
  endpoint: string,
  method: string,
  message: string,
  status?: number,
) => {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent("aulia:action-feedback", {
      detail: {
        kind: "error",
        title:
          status === 401
            ? "Session à renouveler"
            : "Action non effectuée",
        message:
          status === 401
            ? "Votre session n’est plus valide. Reconnectez-vous puis recommencez l’action."
            : `${message}${
                method !== "GET"
                  ? " Aucune modification n’a été enregistrée."
                  : ""
              }`,
        endpoint,
        method,
      },
    }),
  );
};

const reportApiSuccess = (
  endpoint: string,
  method: string,
) => {
  if (
    typeof window === "undefined" ||
    method === "GET"
  ) {
    return;
  }

  window.dispatchEvent(
    new CustomEvent("aulia:action-feedback", {
      detail: {
        kind: "success",
        title: "Action enregistrée",
        message:
          "L’action a été traitée avec succès et les données ont été enregistrées.",
        endpoint,
        method,
      },
    }),
  );
};

/**
 * Reads a successful HTTP response safely.
 *
 * Supported cases:
 * - JSON response
 * - text response
 * - 204 No Content
 * - 205 Reset Content
 * - 200/201 with an empty body
 */
const parseSuccessfulResponse = async <T>(
  response: Response,
  endpoint: string,
): Promise<T> => {
  // HTTP explicitly defines these responses as having no useful body.
  if (
    response.status === 204 ||
    response.status === 205
  ) {
    return undefined as T;
  }

  const contentLength =
    response.headers.get("content-length");

  if (contentLength === "0") {
    return undefined as T;
  }

  /*
   * Read the body once as text.
   *
   * Calling response.json() directly on an empty response throws:
   * "Unexpected end of JSON input".
   */
  const rawBody = await response.text();

  if (!rawBody.trim()) {
    return undefined as T;
  }

  const contentType =
    response.headers.get("content-type") || "";

  if (
    contentType
      .toLowerCase()
      .includes("application/json")
  ) {
    try {
      return JSON.parse(rawBody) as T;
    } catch {
      throw new Error(
        `Réponse JSON invalide reçue depuis ${endpoint}.`,
      );
    }
  }

  // Some successful endpoints can legitimately return plain text.
  return rawBody as T;
};

/**
 * Enhanced fetch with:
 * - cookie authentication
 * - CSRF protection
 * - access-token refresh
 * - timeout handling
 * - API error normalization
 * - safe parsing of empty responses
 */
export const apiFetch = async <T = any>(
  endpoint: string,
  options?: RequestInit,
  timeout: number = 10000,
): Promise<T> => {
  const url = buildUrl(endpoint);

  const method = (
    options?.method || "GET"
  ).toUpperCase();

  const requestHeaders = () => ({
    "Content-Type": "application/json",
    ...getAuthHeaders(),
    ...(options?.headers as Record<string, string>),
  });

  const controller = new AbortController();

  const timeoutId = setTimeout(
    () => controller.abort(),
    timeout,
  );

  try {
    const execute = (
      headers: Record<string, string>,
    ) =>
      fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
        credentials: "include",
      });

    let response = await execute(
      requestHeaders(),
    );

    /*
     * Access tokens are intentionally short-lived.
     *
     * A normal clinical action must not fail simply because
     * the tab remained open for more than the access-token
     * lifetime.
     *
     * Renew once through the HttpOnly refresh cookie, then
     * replay the exact request with the freshly-issued CSRF
     * value.
     *
     * Session-establishment/destruction endpoints must never
     * refresh themselves, preventing refresh loops.
     */
    const canRefresh = ![
      "/auth/login",
      "/auth/refresh",
      "/auth/logout",
      "/auth/csrf",
    ].includes(endpoint);

    if (
      response.status === 401 &&
      canRefresh
    ) {
      const refresh = await fetch(
        buildUrl("/auth/refresh"),
        {
          method: "POST",
          credentials: "include",
          headers: getAuthHeaders(),
          signal: controller.signal,
        },
      );

      if (refresh.ok) {
        response = await execute(
          requestHeaders(),
        );
      }
    }

    clearTimeout(timeoutId);

    /*
     * HTTP errors.
     *
     * Error responses are allowed to have either JSON,
     * text, or no body at all.
     */
    if (!response.ok) {
      let errorData: any = {};

      const rawErrorBody =
        await response.text().catch(() => "");

      if (rawErrorBody.trim()) {
        try {
          errorData = JSON.parse(rawErrorBody);
        } catch {
          errorData = {
            message: rawErrorBody,
          };
        }
      }

      const message =
        typeof errorData?.message === "string" &&
        errorData.message.trim()
          ? errorData.message
          : response.statusText ||
            `Erreur HTTP ${response.status}`;

      reportApiFailure(
        endpoint,
        method,
        message,
        response.status,
      );

      throw new ApiError(
        `API Error: ${response.status} - ${message}`,
        response.status,
        response.statusText,
        errorData,
      );
    }

    /*
     * Successful responses.
     *
     * Crucially, do not blindly call response.json().
     * DELETE/PATCH/session endpoints can legitimately return
     * 204 or another successful empty response.
     */
    const data =
      await parseSuccessfulResponse<T>(
        response,
        endpoint,
      );

    reportApiSuccess(
      endpoint,
      method,
    );

    return data;
  } catch (error: any) {
    clearTimeout(timeoutId);

    if (error?.name === "AbortError") {
      const message =
        "Le serveur n’a pas répondu à temps. Vérifiez la connexion puis réessayez.";

      reportApiFailure(
        endpoint,
        method,
        message,
      );

      throw new Error(message);
    }

    /*
     * ApiError has already been reported above.
     * Avoid displaying the same error twice.
     */
    if (!(error instanceof ApiError)) {
      reportApiFailure(
        endpoint,
        method,
        error instanceof Error
          ? error.message
          : "Une erreur technique est survenue.",
      );
    }

    throw error;
  }
};