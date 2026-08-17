import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { getAuthHeaders } from "../config/api";

export type RoleSlug =
  | "SUPER_ADMIN"
  | "ADMIN"
  | "RECEPTIONIST"
  | "NURSE"
  | "PHYSICIAN"
  | "LAB_TECHNICIAN"
  | "LAB_MANAGER"
  | "RADIOLOGIST"
  | "SURGEON"
  | "ANESTHESIOLOGIST"
  | "PHARMACIST"
  | "FINANCE"
  | "PATIENT"
  | "CASHIER";

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  displayName: string;
  firstName: string;
  lastName: string;
  primaryRole: RoleSlug;
  role?: RoleSlug; // Alias for primaryRole for backward compatibility
  gender?: string;
  specialty?: string;
  phone?: string;
  nationality?: string;
  addressCountry?: string;
  addressProvince?: string;
  addressCity?: string;
  addressNeighborhood?: string;
  addressStreet?: string;
  whatsappUrl?: string;
  facebookUrl?: string;
  instagramUrl?: string;
  linkedinUrl?: string;
  bio?: string;
  profilePhotoUrl?: string;
  Employee?: Array<{
    id: string;
    serviceUnitId?: string;
    departmentId?: string;
    shifts?: Array<{ id: string; startAt: string; endAt: string; type: 'DAY' | 'NIGHT' | 'ROTATING' }>;
  }>;
  serviceResponsabilites?: Array<{
    principal?: boolean;
    service?: {
      id: string;
      name: string;
      isParamedical?: boolean;
    };
  }>;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface AuthContextType {
  currentUser: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (identifier: string, password: string) => Promise<AuthUser | null>;
  logout: () => void;
  updateProfile: (updates: Partial<AuthUser>) => Promise<AuthUser | null>;
  error: string | null;
  restrictedAccount: AuthUser | null;
  clearRestrictedAccount: () => void;
  isLabManager: () => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";
const LEGACY_BROWSER_TOKEN_KEYS = [
  "d7-clinic-access-token",
  "d7-clinic-refresh-token",
  "d7-clinic-auth-token",
  "d7-clinic-api-token",
];

const clearLegacyBrowserTokens = () => {
  try {
    LEGACY_BROWSER_TOKEN_KEYS.forEach((key) => localStorage.removeItem(key));
  } catch {
    // Storage may be unavailable in privacy-restricted browser contexts.
  }
};

export function getRedirectPath(role: RoleSlug) {
  const rolePathMap: Record<RoleSlug, string> = {
    RECEPTIONIST: "/reception",
    NURSE: "/nurse",
    PHYSICIAN: "/doctor",
    CASHIER: "/caissier",
    FINANCE: "/finance",
    LAB_TECHNICIAN: "/laboratoire",
    LAB_MANAGER: "/laboratoire",
    RADIOLOGIST: "/radiologie",
    SURGEON: "/surgery",
    ANESTHESIOLOGIST: "/anesthesiologist",
    PHARMACIST: "/pharmacie",
    PATIENT: "/patient",
    ADMIN: "/administration",
    SUPER_ADMIN: "/admin",
  };
  return rolePathMap[role] || "/";
}

export function getGuidePath(role: RoleSlug) {
  const guidePathMap: Record<RoleSlug, string> = {
    RECEPTIONIST: "/reception/guide",
    NURSE: "/nurse/guide",
    PHYSICIAN: "/doctor/guide",
    CASHIER: "/caissier/guide",
    FINANCE: "/finance/guide",
    LAB_TECHNICIAN: "/laboratoire/guide",
    LAB_MANAGER: "/laboratoire/guide",
    RADIOLOGIST: "/radiologie/guide",
    SURGEON: "/surgery/guide",
    ANESTHESIOLOGIST: "/anesthesiologist/guide",
    PHARMACIST: "/pharmacie/guide",
    PATIENT: "/guide",
    ADMIN: "/administration/guide",
    SUPER_ADMIN: "/admin/guide",
  };
  return guidePathMap[role] || "/guide";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [restrictedAccount, setRestrictedAccount] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isLabManager = (user: AuthUser | null) =>
    user?.primaryRole === "LAB_MANAGER" ||
    user?.role === "LAB_MANAGER" ||
    Boolean(
      user?.serviceResponsabilites?.some((responsibility) =>
        responsibility?.service?.name?.toLowerCase().includes('laboratoire'),
      ),
    );

  const isLabManagerUser = useCallback(
    () => isLabManager(currentUser),
    [currentUser],
  );

  const abortControllerRef = useRef<AbortController | null>(null);

  // The server owns the session through HttpOnly cookies; no credential is read
  // from browser storage.
  const initializeAuth = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    clearLegacyBrowserTokens();

    try {
      // Créer un AbortController pour cette requête
      const controller = new AbortController();
      abortControllerRef.current = controller;

      let res = await fetch(`${API_BASE_URL}/auth/me`, {
        credentials: "include",
        signal: controller.signal,
      });

      // A short-lived access cookie is renewed server-side from the HttpOnly
      // refresh cookie. No token is ever exposed to the page.
      if (res.status === 401) {
        const refresh = await fetch(`${API_BASE_URL}/auth/refresh`, {
          method: "POST",
          credentials: "include",
          headers: getAuthHeaders(),
          signal: controller.signal,
        });
        if (refresh.ok) {
          res = await fetch(`${API_BASE_URL}/auth/me`, {
            credentials: "include",
            signal: controller.signal,
          });
        }
      }

      if (!res.ok) {
        if (res.status === 401) {
          setCurrentUser(null);
        }
        setIsLoading(false);
        return;
      }

      const profile = await res.json() as AuthUser;
      if (profile.status && profile.status !== "ACTIVE") {
        setRestrictedAccount(profile);
        setCurrentUser(null);
        setIsLoading(false);
        return;
      }
      setCurrentUser(profile);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        // Requête annulée (StrictMode cleanup)
        return;
      }
      setError("Erreur lors du chargement du profil");
      setCurrentUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initialiser l'auth au montage
  useEffect(() => {
    initializeAuth();

    return () => {
      // Cleanup pour StrictMode
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [initializeAuth]);

  const login = async (identifier: string, password: string): Promise<AuthUser | null> => {
    setIsLoading(true);
    setError(null);

    try {
      // 1. Appeler POST /auth/login
      const loginRes = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
        credentials: "include",
      });

      if (!loginRes.ok) {
        setError("Identifiants invalides");
        return null;
      }

      const loginPayload = await loginRes.json();
      const { user: loginUser } = loginPayload;

      if (loginUser?.status && loginUser.status !== "ACTIVE") {
        const blockedUser = loginUser as AuthUser;
        setRestrictedAccount(blockedUser);
        setCurrentUser(null);
        return blockedUser;
      }

      if (!loginUser) {
        setError("Réponse du serveur invalide");
        return null;
      }

      // The HttpOnly session cookies are set by the login response.
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const meRes = await fetch(`${API_BASE_URL}/auth/me`, {
        credentials: "include",
        signal: controller.signal,
      });

      if (!meRes.ok) {
        setError("Erreur lors de la récupération du profil");
        return null;
      }

      const profile = await meRes.json() as AuthUser;
      if (profile.status && profile.status !== "ACTIVE") {
        setCurrentUser(null);
        setRestrictedAccount(profile);
        return profile;
      }
      setCurrentUser(profile);
      return profile;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return null;
      }
      setError("Erreur lors de la connexion");
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    void fetch(`${API_BASE_URL}/auth/logout`, {
      method: "POST",
      headers: getAuthHeaders(),
      credentials: "include",
    });
    setCurrentUser(null);
    setError(null);
  };

  const updateProfile = async (updates: Partial<AuthUser>): Promise<AuthUser | null> => {
    if (!currentUser) {
      setError("Aucun utilisateur connecté");
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/profile`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        credentials: "include",
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        setError("Erreur lors de la mise à jour du profil");
        return null;
      }

      const updatedUser = await response.json() as AuthUser;
      setCurrentUser(updatedUser);
      return updatedUser;
    } catch (err) {
      setError("Erreur lors de la mise à jour du profil");
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const value: AuthContextType = {
    currentUser,
    isAuthenticated: !!currentUser,
    isLoading,
    login,
    logout,
    updateProfile,
    error,
    restrictedAccount,
    clearRestrictedAccount: () => setRestrictedAccount(null),
    isLabManager: isLabManagerUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
