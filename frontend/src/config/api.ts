/**
 * Centralized API configuration
 * All API endpoints and base URLs are defined here
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

  // Patient endpoints - PUBLIC (no auth required)
  PUBLIC_PATIENTS: {
    SEARCH: "/public/patients/search",
    CREATE_ADMISSION: "/public/patients/admissions",
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
    RECORD_VITAL_SIGNS: (patientId: string) => `/patients/${patientId}/vital-signs`,
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
 * Build full URL from endpoint
 */
export const buildUrl = (endpoint: string): string => {
  const baseUrl = API_CONFIG.BASE_URL.replace(/\/+$/, "");
  const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  return `${baseUrl}${path}`;
};

const getCookie = (name: string): string | null => {
  if (typeof document === "undefined") return null;
  const prefix = `${name}=`;
  return document.cookie
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(prefix))
    ?.slice(prefix.length) ?? null;
};

// Access tokens are deliberately never exposed to JavaScript. This function is
// retained only for compatibility with callers that previously read localStorage.
export const getAuthToken = (): string | null => null;

/** Adds the non-sensitive CSRF value required for cookie-authenticated writes. */
export const getAuthHeaders = (): Record<string, string> => {
  const csrfToken = getCookie("aulia_csrf_token");
  return csrfToken ? { "X-CSRF-Token": csrfToken } : {};
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

/**
 * Enhanced fetch with error handling and retry logic
 */
export const apiFetch = async <T = any>(
  endpoint: string,
  options?: RequestInit,
  timeout: number = 10000
): Promise<T> => {
  const url = buildUrl(endpoint);
  const headers = {
    "Content-Type": "application/json",
    ...getAuthHeaders(),
    ...(options?.headers as Record<string, string>),
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
      credentials: "include",
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const message = typeof errorData.message === "string" ? errorData.message : response.statusText;
      throw new ApiError(`API Error: ${response.status} - ${message}`, response.status, response.statusText, errorData);
    }

    return await response.json();
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      throw new Error(`Request timeout after ${timeout}ms`);
    }
    throw error;
  }
};
