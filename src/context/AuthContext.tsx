import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";

export type RoleSlug =
  | "SUPER_ADMIN"
  | "ADMIN"
  | "RECEPTIONIST"
  | "NURSE"
  | "PHYSICIAN"
  | "LAB_TECHNICIAN"
  | "RADIOLOGIST"
  | "SURGEON"
  | "ANESTHESIOLOGIST"
  | "PHARMACIST"
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
  error: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const ACCESS_TOKEN_KEY = "d7-clinic-access-token";
const REFRESH_TOKEN_KEY = "d7-clinic-refresh-token";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

export function getRedirectPath(role: RoleSlug) {
  const rolePathMap: Record<RoleSlug, string> = {
    RECEPTIONIST: "/reception",
    NURSE: "/infirmier",
    PHYSICIAN: "/medecin",
    CASHIER: "/caissier",
    LAB_TECHNICIAN: "/laboratoire",
    RADIOLOGIST: "/radiologie",
    SURGEON: "/surgery",
    ANESTHESIOLOGIST: "/anesthesiologist",
    PHARMACIST: "/pharmacie",
    PATIENT: "/",
    ADMIN: "/administration",
    SUPER_ADMIN: "/admin",
  };
  return rolePathMap[role] || "/";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Charger le user depuis /auth/me si un token existe
  const initializeAuth = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem(ACCESS_TOKEN_KEY);
      if (!token) {
        setCurrentUser(null);
        setIsLoading(false);
        return;
      }

      // Créer un AbortController pour cette requête
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const res = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
        signal: controller.signal,
      });

      if (!res.ok) {
        if (res.status === 401) {
          // Token expiré ou invalide
          localStorage.removeItem(ACCESS_TOKEN_KEY);
          localStorage.removeItem(REFRESH_TOKEN_KEY);
          setCurrentUser(null);
        }
        setIsLoading(false);
        return;
      }

      const profile = await res.json() as AuthUser;
      setCurrentUser(profile);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        // Requête annulée (StrictMode cleanup)
        return;
      }
      setError("Erreur lors du chargement du profil");
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
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

      const { accessToken, refreshToken } = await loginRes.json();

      if (!accessToken || !refreshToken) {
        setError("Réponse du serveur invalide");
        return null;
      }

      // 2. Sauvegarder les tokens
      localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
      localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);

      // 3. Appeler GET /auth/me pour récupérer le profil complet
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const meRes = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: "include",
        signal: controller.signal,
      });

      if (!meRes.ok) {
        setError("Erreur lors de la récupération du profil");
        localStorage.removeItem(ACCESS_TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        return null;
      }

      const profile = await meRes.json() as AuthUser;
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
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    setCurrentUser(null);
    setError(null);
  };

  const value: AuthContextType = {
    currentUser,
    isAuthenticated: !!currentUser,
    isLoading,
    login,
    logout,
    error,
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
