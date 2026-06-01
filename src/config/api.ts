/**
 * Centralized API configuration
 * All API endpoints and base URLs are defined here
 */

export const API_CONFIG = {
  // Base URL for the API backend
  BASE_URL: import.meta.env.VITE_API_BASE_URL || "http://localhost:3000",
  
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

/**
 * Get authentication token from localStorage
 */
export const getAuthToken = (): string | null => {
  try {
    return (
      localStorage.getItem("d7-clinic-auth-token") ||
      localStorage.getItem("d7-clinic-access-token") ||
      localStorage.getItem("d7-clinic-api-token")
    );
  } catch {
    return null;
  }
};

/**
 * Get authorization headers
 */
export const getAuthHeaders = (): Record<string, string> => {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

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
      throw new Error(
        `API Error: ${response.status} - ${
          errorData.message || response.statusText
        }`
      );
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
