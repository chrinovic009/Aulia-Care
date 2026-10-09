import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { getAuthHeaders } from "../config/api";

export type RoleSlug =
  | "DEV"
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

export type SessionSecurityState = "CHECKING" | "UNLOCKED" | "LOCKED";

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  displayName: string;
  firstName: string;
  lastName: string;
  primaryRole: RoleSlug;

  /** Immutable tenant chosen by secure provisioning; never client-editable. */
  clinicId?: string | null;

  /** Alias conservé pour compatibilité avec le code existant. */
  role?: RoleSlug;

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
    shifts?: Array<{
      id: string;
      startAt: string;
      endAt: string;
      type: "DAY" | "NIGHT" | "ROTATING";
    }>;
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

  /**
   * Etat de sécurité de la session.
   *
   * CHECKING  : l'état de sécurité n'est pas encore établi.
   * LOCKED    : la session existe mais le PIN doit être vérifié.
   * UNLOCKED  : les appels métier protégés peuvent être exécutés.
   */
  sessionSecurityState: SessionSecurityState;
  setSessionSecurityState: (state: SessionSecurityState) => void;

  login: (
    identifier: string,
    password: string,
  ) => Promise<AuthUser | null>;

  logout: () => void;

  updateProfile: (
    updates: Partial<AuthUser>,
  ) => Promise<AuthUser | null>;

  error: string | null;
  restrictedAccount: AuthUser | null;
  clearRestrictedAccount: () => void;
  isLabManager: () => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "/api";

const LEGACY_BROWSER_TOKEN_KEYS = [
  "aulia-care-access-token",
  "aulia-care-refresh-token",
  "aulia-care-auth-token",
  "aulia-care-api-token",
];

const clearLegacyBrowserTokens = () => {
  try {
    LEGACY_BROWSER_TOKEN_KEYS.forEach((key) =>
      localStorage.removeItem(key),
    );
  } catch {
    // Storage peut être indisponible dans certains contextes privés.
  }
};

const clearExpiredSessionCookies = async () => {
  // CSRF n'est volontairement pas utilisé comme indicateur de session.
  // Le serveur est responsable du nettoyage sécurisé des cookies.
  await fetch(
    `${API_BASE_URL}/auth/clear-expired-session`,
    {
      method: "POST",
      credentials: "include",
      headers: getAuthHeaders(),
    },
  ).catch(() => undefined);
};

const knownRoles = new Set<RoleSlug>([
  "DEV",
  "SUPER_ADMIN",
  "ADMIN",
  "RECEPTIONIST",
  "NURSE",
  "PHYSICIAN",
  "LAB_TECHNICIAN",
  "LAB_MANAGER",
  "RADIOLOGIST",
  "SURGEON",
  "ANESTHESIOLOGIST",
  "PHARMACIST",
  "FINANCE",
  "PATIENT",
  "CASHIER",
]);

const normalizeAuthenticatedUser = (
  raw: AuthUser,
): AuthUser | null => {
  const primaryRole = String(
    raw.primaryRole || raw.role || "",
  ).toUpperCase() as RoleSlug;

  if (!knownRoles.has(primaryRole)) {
    return null;
  }

  return {
    ...raw,
    primaryRole,
    role: primaryRole,
  };
};

export function getRedirectPath(role: RoleSlug) {
  const rolePathMap: Record<RoleSlug, string> = {
    DEV: "/dev/couches",
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
    DEV: "/dev/couches",
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

export function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [currentUser, setCurrentUser] =
    useState<AuthUser | null>(null);

  const [restrictedAccount, setRestrictedAccount] =
    useState<AuthUser | null>(null);

  const [isLoading, setIsLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  /**
   * Source de vérité frontend pour l'état de sécurité de la session.
   *
   * Les providers de données ne doivent pas lancer d'appels métier
   * pendant CHECKING ou LOCKED.
   */
  const [
    sessionSecurityState,
    setSessionSecurityState,
  ] = useState<SessionSecurityState>("CHECKING");

  const isLabManager = (user: AuthUser | null) =>
    user?.primaryRole === "LAB_MANAGER" ||
    user?.role === "LAB_MANAGER" ||
    Boolean(
      user?.serviceResponsabilites?.some(
        (responsibility) =>
          responsibility?.service?.name
            ?.toLowerCase()
            .includes("laboratoire"),
      ),
    );

  const isLabManagerUser = useCallback(
    () => isLabManager(currentUser),
    [currentUser],
  );

  const abortControllerRef =
    useRef<AbortController | null>(null);

  /**
   * Restauration d'une session existante.
   *
   * Une restauration n'est PAS considérée comme une authentification
   * fraîche. Si l'utilisateur possède un PIN, la session est verrouillée
   * côté serveur avant d'être exposée à l'application.
   */
  const initializeAuth = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setSessionSecurityState("CHECKING");

    clearLegacyBrowserTokens();

    const hint = await fetch(
      `${API_BASE_URL}/auth/session-hint`,
      {
        credentials: "include",
      },
    )
      .then(async (response) =>
        response.ok
          ? (response.json() as Promise<{
              hasSession?: boolean;
            }>)
          : { hasSession: false },
      )
      .catch(() => ({
        hasSession: false,
      }));

    if (!hint.hasSession) {
      setCurrentUser(null);
      setSessionSecurityState("UNLOCKED");
      setIsLoading(false);
      return;
    }

    try {
      const controller = new AbortController();
      abortControllerRef.current = controller;

      let res = await fetch(
        `${API_BASE_URL}/auth/me`,
        {
          credentials: "include",
          signal: controller.signal,
        },
      );

      /**
       * Le cookie d'accès peut expirer avant la session persistée.
       * Dans ce cas, le refresh HttpOnly renouvelle l'accès.
       */
      if (res.status === 401) {
        const refresh = await fetch(
          `${API_BASE_URL}/auth/refresh`,
          {
            method: "POST",
            credentials: "include",
            headers: getAuthHeaders(),
            signal: controller.signal,
          },
        );

        if (refresh.ok) {
          res = await fetch(
            `${API_BASE_URL}/auth/me`,
            {
              credentials: "include",
              signal: controller.signal,
            },
          );
        }
      }

      if (!res.ok) {
        if (res.status === 401) {
          await clearExpiredSessionCookies();
          setCurrentUser(null);
        }

        setSessionSecurityState("UNLOCKED");
        setIsLoading(false);
        return;
      }

      const profile =
        normalizeAuthenticatedUser(
          (await res.json()) as AuthUser,
        );

      if (!profile) {
        setCurrentUser(null);
        setSessionSecurityState("UNLOCKED");
        setError(
          "Session invalide : rôle utilisateur inconnu.",
        );
        return;
      }

      if (
        profile.status &&
        profile.status !== "ACTIVE"
      ) {
        setRestrictedAccount(profile);
        setCurrentUser(null);
        setSessionSecurityState("UNLOCKED");
        setIsLoading(false);
        return;
      }

      /**
       * Vérification de la politique PIN avant d'exposer le compte.
       */
      const security = await fetch(
        `${API_BASE_URL}/auth/security-status`,
        {
          credentials: "include",
          signal: controller.signal,
        },
      );

      if (!security.ok) {
        setError(
          "Impossible de vérifier la sécurité de la session.",
        );
        setCurrentUser(null);
        setSessionSecurityState("CHECKING");
        return;
      }

      const securityState =
        (await security.json()) as {
          hasPin?: boolean;
        };

      if (securityState.hasPin) {
        /**
         * Une session restaurée possédant un PIN doit être verrouillée
         * côté serveur AVANT que currentUser soit publié.
         */
        const lock = await fetch(
          `${API_BASE_URL}/auth/lock-session`,
          {
            method: "POST",
            credentials: "include",
            headers: getAuthHeaders(),
            signal: controller.signal,
          },
        );

        if (!lock.ok) {
          setError(
            "Impossible de verrouiller la session restaurée.",
          );
          setCurrentUser(null);
          setSessionSecurityState("CHECKING");
          return;
        }

        /**
         * Important :
         * currentUser sera publié, mais les providers savent maintenant
         * qu'ils ne doivent pas interroger les endpoints métier.
         */
        setSessionSecurityState("LOCKED");
      } else {
        setSessionSecurityState("UNLOCKED");
      }

      setCurrentUser(profile);
    } catch (err) {
      if (
        err instanceof Error &&
        err.name === "AbortError"
      ) {
        return;
      }

      setError(
        "Erreur lors du chargement du profil",
      );
      setCurrentUser(null);
      setSessionSecurityState("CHECKING");
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Initialisation au montage.
   */
  useEffect(() => {
    void initializeAuth();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [initializeAuth]);

  /**
   * Authentification par mot de passe.
   *
   * Le mot de passe vient d'être validé : la session est donc considérée
   * comme fraîche et immédiatement UNLOCKED.
   */
  const login = async (
    identifier: string,
    password: string,
  ): Promise<AuthUser | null> => {
    setIsLoading(true);
    setError(null);
    setSessionSecurityState("CHECKING");

    try {
      const loginRes = await fetch(
        `${API_BASE_URL}/auth/login`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            identifier,
            password,
          }),
          credentials: "include",
        },
      );

      if (!loginRes.ok) {
        setError("Identifiants invalides");
        setSessionSecurityState("UNLOCKED");
        return null;
      }

      const loginPayload =
        await loginRes.json();

      const { user: loginUser } =
        loginPayload;

      if (
        loginUser?.status &&
        loginUser.status !== "ACTIVE"
      ) {
        const blockedUser =
          loginUser as AuthUser;

        setRestrictedAccount(blockedUser);
        setCurrentUser(null);
        setSessionSecurityState("UNLOCKED");

        return blockedUser;
      }

      if (!loginUser) {
        setError(
          "Réponse du serveur invalide",
        );
        setSessionSecurityState("UNLOCKED");
        return null;
      }

      /**
       * Les cookies de session HttpOnly viennent d'être créés
       * par /auth/login.
       */
      const controller =
        new AbortController();

      abortControllerRef.current =
        controller;

      const meRes = await fetch(
        `${API_BASE_URL}/auth/me`,
        {
          credentials: "include",
          signal: controller.signal,
        },
      );

      if (!meRes.ok) {
        setError(
          "Erreur lors de la récupération du profil",
        );
        setSessionSecurityState("UNLOCKED");
        return null;
      }

      const profile =
        normalizeAuthenticatedUser(
          (await meRes.json()) as AuthUser,
        );

      if (!profile) {
        setError(
          "Profil utilisateur invalide",
        );
        setCurrentUser(null);
        setSessionSecurityState("UNLOCKED");
        return null;
      }

      if (
        profile.status &&
        profile.status !== "ACTIVE"
      ) {
        setCurrentUser(null);
        setRestrictedAccount(profile);
        setSessionSecurityState("UNLOCKED");

        return profile;
      }

      /**
       * Une authentification par mot de passe vient d'avoir lieu.
       * Elle constitue une authentification fraîche.
       *
       * SessionLock consommera ce marqueur une seule fois.
       */
      sessionStorage.setItem(
        `aulia.fresh-auth.${profile.id}`,
        "1",
      );

      setSessionSecurityState("UNLOCKED");
      setCurrentUser(profile);

      return profile;
    } catch (err) {
      if (
        err instanceof Error &&
        err.name === "AbortError"
      ) {
        return null;
      }

      setError(
        "Erreur lors de la connexion",
      );
      setSessionSecurityState("UNLOCKED");

      return null;
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Déconnexion.
   */
  const logout = () => {
    void fetch(
      `${API_BASE_URL}/auth/logout`,
      {
        method: "POST",
        headers: getAuthHeaders(),
        credentials: "include",
      },
    );

    if (currentUser?.id) {
      sessionStorage.removeItem(
        `aulia.fresh-auth.${currentUser.id}`,
      );
    }

    setCurrentUser(null);
    setSessionSecurityState("UNLOCKED");
    setError(null);
  };

  /**
   * Mise à jour du profil utilisateur.
   */
  const updateProfile = async (
    updates: Partial<AuthUser>,
  ): Promise<AuthUser | null> => {
    if (!currentUser) {
      setError(
        "Aucun utilisateur connecté",
      );
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}/auth/profile`,
        {
          method: "PATCH",
          headers: {
            "Content-Type":
              "application/json",
            ...getAuthHeaders(),
          },
          credentials: "include",
          body: JSON.stringify(updates),
        },
      );

      if (!response.ok) {
        setError(
          "Erreur lors de la mise à jour du profil",
        );
        return null;
      }

      const updatedUser =
        (await response.json()) as AuthUser;

      setCurrentUser(updatedUser);

      return updatedUser;
    } catch {
      setError(
        "Erreur lors de la mise à jour du profil",
      );
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const value: AuthContextType = {
    currentUser,
    isAuthenticated: !!currentUser,
    isLoading,

    sessionSecurityState,
    setSessionSecurityState,

    login,
    logout,
    updateProfile,

    error,
    restrictedAccount,

    clearRestrictedAccount: () =>
      setRestrictedAccount(null),

    isLabManager: isLabManagerUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context =
    useContext(AuthContext);

  if (!context) {
    throw new Error(
      "useAuth must be used within an AuthProvider",
    );
  }

  return context;
}