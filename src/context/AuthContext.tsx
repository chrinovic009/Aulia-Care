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

const staticUsers: AuthCredentials[] = [
  {
    id: "user-reception-001",
    email: "failakeren04@gmail.com",
    username: "d7fk01",
    displayName: "Keren Faila",
    firstName: "Keren",
    lastName: "Faila",
    role: "RECEPTIONIST",
    gender: "F",
    password: "d7-12026",
    specialty: undefined,
    phone: "+243991666646",
    nationality: "Congolaise",
    addressCountry: "République Démocratique du Congo",
    addressProvince: "Lualaba",
    addressCity: "Kolwezi",
    addressNeighborhood: "Joli Site",
    addressStreet: "Avenue John Kahozi",
    whatsappUrl: "https://wa.me/243991666646",
    facebookUrl: "https://www.facebook.com/miss_fnk",
    instagramUrl: "https://www.instagram.com/miss_fnk",
    bio: "Réceptionniste expérimentée qui veille à l’accueil de chaque patient avec attention et professionnalisme.",
    profilePhotoUrl: undefined,
  },
    {
      id: "user-cashier-001",
      email: "patriciamwambi@clinique.local",
      username: "d7pm01",
      displayName: "Patricia Mwambi",
      firstName: "Patricia",
      lastName: "Mwambi",
      role: "CASHIER",
      gender: "F",
      password: "d7-cash-01",
      specialty: undefined,
      phone: "+243990000001",
      nationality: "Congolaise",
      addressCountry: "République Démocratique du Congo",
      addressProvince: "Haut-Katanga",
      addressCity: "Lubumbashi",
      addressNeighborhood: "Centre",
      addressStreet: "Avenue de la Paix",
      whatsappUrl: "https://wa.me/243990000001",
      facebookUrl: "",
      instagramUrl: "",
      bio: "Caissière principale responsable des validations et encaissements.",
      profilePhotoUrl: undefined,
    },
  {
    id: "user-nurse-001",
    email: "matendagedeon@gmail.com",
    username: "d7mg02",
    displayName: "Gédéon Matenda",
    firstName: "Gédéon",
    lastName: "Matenda",
    role: "NURSE",
    gender: "M",
    password: "d7-22026",
    specialty: undefined,
    phone: "+243971462456",
    nationality: "Congolaise",
    addressCountry: "République Démocratique du Congo",
    addressProvince: "Lualaba",
    addressCity: "Kolwezi",
    addressNeighborhood: "Joli Site",
    addressStreet: "Avenue Kazembe",
    whatsappUrl: "https://wa.me/243971462456",
    facebookUrl: "https://www.facebook.com/bro_ged",
    instagramUrl: "https://www.instagram.com/bro_ged",
    bio: "Infirmier engagé, spécialiste du suivi des constantes vitales et du soutien des patients en hospitalisation.",
    profilePhotoUrl: undefined,
  },
  {
    id: "user-nurse-002",
    email: "joelkayemb@gmail.com",
    username: "d7jk09",
    displayName: "Joel Kayemb",
    firstName: "Joel",
    lastName: "Kayemb",
    role: "NURSE",
    gender: "M",
    password: "d7-92026",
    specialty: undefined,
    phone: "+243971462456",
    nationality: "Congolaise",
    addressCountry: "République Démocratique du Congo",
    addressProvince: "Lualaba",
    addressCity: "Kolwezi",
    addressNeighborhood: "Joli Site",
    addressStreet: "Avenue Kazembe",
    whatsappUrl: "https://wa.me/243971462456",
    facebookUrl: "https://www.facebook.com/bro_ged",
    instagramUrl: "https://www.instagram.com/bro_ged",
    bio: "Infirmier engagé, spécialiste du suivi des constantes vitales et du soutien des patients en hospitalisation.",
    profilePhotoUrl: undefined,
  },
  {
    id: "user-doctor-001",
    email: "nagedegemwehu@gmail.com",
    username: "d7nm03",
    displayName: "Nadège Mwehu",
    firstName: "Nadège",
    lastName: "Mwehu",
    role: "PHYSICIAN",
    gender: "F",
    password: "d7-32026",
    specialty: "Généraliste",
    phone: "+243994652587",
    nationality: "Congolaise",
    addressCountry: "République Démocratique du Congo",
    addressProvince: "Haut-Katanga",
    addressCity: "Lubumbashi",
    addressNeighborhood: "Kalubwe",
    addressStreet: "Avenue Double Poto",
    whatsappUrl: "https://wa.me/243994652587",
    facebookUrl: "https://www.facebook.com/nadege_m",
    instagramUrl: "https://www.instagram.com/nadege_m",
    bio: "Médecin généraliste dédiée au diagnostic et au suivi attentif des patients en consultation et en hospitalisation.",
    profilePhotoUrl: undefined,
  },
  {
    id: "user-doctor-002",
    email: "jeankaseba@gmail.com",
    username: "d7jk04",
    displayName: "Jean Kaseba",
    firstName: "Jean",
    lastName: "Kaseba",
    role: "PHYSICIAN",
    password: "d7-42026",
    specialty: "Cardiologue",
    phone: "+243983450112",
    nationality: "Congolaise",
    addressCountry: "République Démocratique du Congo",
    addressProvince: "Haut-Katanga",
    addressCity: "Lubumbashi",
    addressNeighborhood: "Hippodrome",
    addressStreet: "Avenue du 30 Juin",
    whatsappUrl: "https://wa.me/243983450112",
    facebookUrl: "https://www.facebook.com/jean.kaseba",
    instagramUrl: "https://www.instagram.com/jean.kaseba",
    bio: "Cardiologue spécialisé dans la prise en charge des maladies cardiovasculaires et l’orientation vers les soins critiques.",
    profilePhotoUrl: undefined,
  },
  {
    id: "user-doctor-003",
    email: "chantalmumbashi@gmail.com",
    username: "d7cm05",
    displayName: "Chantal Mumbashi",
    firstName: "Chantal",
    lastName: "Mumbashi",
    role: "PHYSICIAN",
    password: "d7-52026",
    specialty: "Pédiatre",
    phone: "+243993215478",
    nationality: "Congolaise",
    addressCountry: "République Démocratique du Congo",
    addressProvince: "Haut-Katanga",
    addressCity: "Lubumbashi",
    addressNeighborhood: "Kimpanzu",
    addressStreet: "Avenue des Acacias",
    whatsappUrl: "https://wa.me/243993215478",
    facebookUrl: "https://www.facebook.com/chantal.mumbashi",
    instagramUrl: "https://www.instagram.com/chantal.mumbashi",
    bio: "Pédiatre passionnée par l’accompagnement des enfants et des familles dans le cadre de soins médicaux structurés.",
    profilePhotoUrl: undefined,
  },
  {
    id: "user-doctor-004",
    email: "alain.tshibanda@gmail.com",
    username: "d7at06",
    displayName: "Alain Tshibanda",
    firstName: "Alain",
    lastName: "Tshibanda",
    role: "PHYSICIAN",
    password: "d7-62026",
    specialty: "Gynécologue",
    phone: "+243990987654",
    nationality: "Congolaise",
    addressCountry: "République Démocratique du Congo",
    addressProvince: "Haut-Katanga",
    addressCity: "Lubumbashi",
    addressNeighborhood: "Kasenyi",
    addressStreet: "Avenue Mandela",
    whatsappUrl: "https://wa.me/243990987654",
    facebookUrl: "https://www.facebook.com/alain.tshibanda",
    instagramUrl: "https://www.instagram.com/alain.tshibanda",
    bio: "Gynécologue expert, attentif aux parcours de soins féminins et aux bilans préopératoires.",
    profilePhotoUrl: undefined,
  },
  {
    id: "user-doctor-005",
    email: "rose.lunda@gmail.com",
    username: "d7rl07",
    displayName: "Rose Lunda",
    firstName: "Rose",
    lastName: "Lunda",
    role: "PHYSICIAN",
    password: "d7-72026",
    specialty: "Orthopédiste",
    phone: "+243989321475",
    nationality: "Congolaise",
    addressCountry: "République Démocratique du Congo",
    addressProvince: "Haut-Katanga",
    addressCity: "Lubumbashi",
    addressNeighborhood: "Kafubu",
    addressStreet: "Avenue Laurent-Désiré Kabila",
    whatsappUrl: "https://wa.me/243989321475",
    facebookUrl: "https://www.facebook.com/rose.lunda",
    instagramUrl: "https://www.instagram.com/rose.lunda",
    bio: "Orthopédiste qualifiée, spécialisée dans les pathologies musculo-squelettiques et les suivis post-opératoires.",
    profilePhotoUrl: undefined,
  },
  {
    id: "user-doctor-006",
    email: "luc.mwamba@gmail.com",
    username: "d7lm08",
    displayName: "Luc Mwamba",
    firstName: "Luc",
    lastName: "Mwamba",
    role: "PHYSICIAN",
    password: "d7-82026",
    specialty: "Radiologue",
    phone: "+243986321974",
    nationality: "Congolaise",
    addressCountry: "République Démocratique du Congo",
    addressProvince: "Haut-Katanga",
    addressCity: "Lubumbashi",
    addressNeighborhood: "Kenya",
    addressStreet: "Avenue de l’Indépendance",
    whatsappUrl: "https://wa.me/243986321974",
    facebookUrl: "https://www.facebook.com/luc.mwamba",
    instagramUrl: "https://www.instagram.com/luc.mwamba",
    bio: "Radiologue spécialisé en imagerie diagnostique, garantissant un diagnostic précis et des rapports radiologiques clairs.",
    profilePhotoUrl: undefined,
  },
  {
    id: "user-nurse-001",
    email: "omboelsa@gmail.com",
    username: "d7oe010",
    displayName: "Elsa Ombo",
    firstName: "Elsa",
    lastName: "Ombo",
    role: "NURSE",
    gender: "F",
    password: "d7-102026",
    specialty: undefined,
    phone: "+243971462456",
    nationality: "Congolaise",
    addressCountry: "République Démocratique du Congo",
    addressProvince: "Lualaba",
    addressCity: "Kolwezi",
    addressNeighborhood: "Joli Site",
    addressStreet: "Avenue Kazembe",
    whatsappUrl: "https://wa.me/243971462456",
    facebookUrl: "https://www.facebook.com/bro_ged",
    instagramUrl: "https://www.instagram.com/bro_ged",
    bio: "Infirmier engagé, spécialiste du suivi des constantes vitales et du soutien des patients en hospitalisation.",
    profilePhotoUrl: undefined,
  },
];

function mapToUser(user: AuthCredentials): AuthUser {
  const { password, ...cleanUser } = user;
  return cleanUser;
}

function findUser(identifier: string, password: string) {
  const normalized = identifier.trim().toLowerCase();
  return staticUsers.find(
    (user) =>
      (user.username.toLowerCase() === normalized || user.email.toLowerCase() === normalized) &&
      user.password === password
  );
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
