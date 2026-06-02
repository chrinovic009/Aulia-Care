import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { findPatientByCredentials, PatientRecord } from "../api/reception";

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
  role: RoleSlug;
  gender?: "M" | "F";
  specialty?: string;
  phone: string;
  nationality: string;
  addressCountry: string;
  addressProvince: string;
  addressCity: string;
  addressNeighborhood: string;
  addressStreet: string;
  whatsappUrl: string;
  facebookUrl: string;
  instagramUrl: string;
  linkedinUrl?: string;
  bio: string;
  profilePhotoUrl?: string;
}

interface AuthCredentials extends AuthUser {
  password: string;
}

interface AuthContextType {
  currentUser: AuthUser | null;
  isAuthenticated: boolean;
  login: (identifier: string, password: string) => AuthUser | null;
  logout: () => void;
  updateProfile: (updates: Partial<AuthUser>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const ACCESS_TOKEN_KEY = "d7-clinic-access-token";
const REFRESH_TOKEN_KEY = "d7-clinic-refresh-token";
const PROFILE_OVERRIDES_KEY = "d7-clinic-user-profile-overrides";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

const loadProfileOverrides = (userId: string): Partial<AuthUser> | null => {
  try {
    const raw = localStorage.getItem(PROFILE_OVERRIDES_KEY);
    if (!raw) return null;
    const store = JSON.parse(raw) as Record<string, Partial<AuthUser>>;
    return store[userId] || null;
  } catch {
    return null;
  }
};

const saveProfileOverrides = (userId: string, profile: Partial<AuthUser>) => {
  try {
    const raw = localStorage.getItem(PROFILE_OVERRIDES_KEY);
    const store = raw ? (JSON.parse(raw) as Record<string, Partial<AuthUser>>) : {};
    store[userId] = { ...store[userId], ...profile };
    localStorage.setItem(PROFILE_OVERRIDES_KEY, JSON.stringify(store));
  } catch {
    // ignore write errors
  }
};

function mapToUser(user: AuthCredentials): AuthUser {
  const { password, ...cleanUser } = user;
  return cleanUser;
}

function mapPatientToAuthUser(patient: PatientRecord): AuthUser {
  const names = patient.name.trim().split(/\s+/);
  const firstName = names[0] || "Patient";
  const lastName = names.length > 1 ? names[names.length - 1] : firstName;
  return {
    id: patient.id,
    username: patient.matricule,
    email: patient.email || "",
    displayName: patient.name,
    firstName,
    lastName,
    role: "PATIENT",
    gender: patient.gender as "M" | "F" | undefined,
    phone: patient.phone || "",
    nationality: "",
    addressCountry: "",
    addressProvince: "",
    addressCity: "",
    addressNeighborhood: "",
    addressStreet: "",
    whatsappUrl: "",
    facebookUrl: "",
    instagramUrl: "",
    bio: "Patient connecté via la réception.",
  };
}

export function getRedirectPath(role: RoleSlug) {
  switch (role) {
    case "RECEPTIONIST":
      return "/reception";
    case "NURSE":
      return "/nurse";
    case "PHYSICIAN":
      return "/doctor";
    case "CASHIER":
      return "/caissier";
    case "PATIENT":
      return "/";
    default:
      return "/";
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!token) return;

    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
          credentials: 'include',
        });
        if (!res.ok) {
          localStorage.removeItem(ACCESS_TOKEN_KEY);
          localStorage.removeItem(REFRESH_TOKEN_KEY);
          return;
        }
        const profile = await res.json();
        setCurrentUser(profile as AuthUser);
      } catch {
        localStorage.removeItem(ACCESS_TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
      }
    })();
  }, []);

  const login = async (identifier: string, password: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
        credentials: 'include',
      });
      if (!res.ok) return null;
      const data = await res.json();
      const { accessToken, refreshToken, user } = data as any;
      if (accessToken) localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
      if (refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
      if (user) setCurrentUser(user as AuthUser);
      return user as AuthUser | null;
    } catch (e) {
      // fallback to local static users/patients for offline dev
      const found = findUser(identifier, password);
      if (found) {
        const baseUser = mapToUser(found);
        const overrides = loadProfileOverrides(baseUser.id);
        const authenticated = overrides ? { ...baseUser, ...overrides } : baseUser;
        setCurrentUser(authenticated);
        return authenticated;
      }
      const patient = findPatientByCredentials(identifier, password);
      if (patient) {
        const authPatient = mapPatientToAuthUser(patient);
        setCurrentUser(authPatient);
        return authPatient;
      }
      return null;
    }
  };

  const logout = () => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    setCurrentUser(null);
  };

  const updateProfile = (updates: Partial<AuthUser>) => {
    if (!currentUser) return;

    const updated: AuthUser = {
      ...currentUser,
      ...updates,
      displayName: `${updates.firstName ?? currentUser.firstName} ${updates.lastName ?? currentUser.lastName}`,
    };

    setCurrentUser(updated);
    saveProfileOverrides(updated.id, updated);
  };

  const value = useMemo(
    () => ({
      currentUser,
      isAuthenticated: Boolean(currentUser),
      login,
      logout,
      updateProfile,
    }),
    [currentUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
