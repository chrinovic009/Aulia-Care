import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { apiFetch } from "../config/api";
import { useAuth } from "./AuthContext";
import type { AuliaLayer } from "../config/auliaCapabilities";

export type { AuliaLayer } from "../config/auliaCapabilities";

export type PlatformLayers = {
  configured: boolean;
  enabledLayers: AuliaLayer[];
  availableLayers: AuliaLayer[];
  configurationVersion: number;
  configuredAt: string | null;
  updatedAt: string | null;
};

const fallback: PlatformLayers = {
  configured: false,
  enabledLayers: [],
  availableLayers: ["CORE", "CONNECTED", "DIAGNOSTIC"],
  configurationVersion: 0,
  configuredAt: null,
  updatedAt: null,
};

type PlatformLayersContextValue = {
  layers: PlatformLayers;
  isLoading: boolean;
  isEnabled: (layer: AuliaLayer) => boolean;
  refresh: () => Promise<void>;
};

const PlatformLayersContext =
  createContext<PlatformLayersContextValue | undefined>(
    undefined,
  );

export function PlatformLayersProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const {
    currentUser,
    sessionSecurityState,
  } = useAuth();

  const [layers, setLayers] =
    useState<PlatformLayers>(fallback);

  const [isLoading, setIsLoading] =
    useState(false);

  /**
   * Charge la configuration des couches uniquement lorsque
   * la session est authentifiée ET déverrouillée.
   *
   * Une session LOCKED ne doit jamais provoquer un appel à
   * /platform/layers, car le backend doit légitimement le refuser.
   */
  const refresh = useCallback(async () => {
    /**
     * Aucun utilisateur authentifié :
     * aucune licence clinique à exposer.
     */
    if (!currentUser) {
      setLayers(fallback);
      setIsLoading(false);
      return;
    }

    /**
     * La session existe mais sa sécurité n'est pas encore établie,
     * ou elle attend la validation du PIN.
     *
     * IMPORTANT :
     * on ne transforme pas cet état en "licence désactivée".
     */
    if (
      sessionSecurityState !== "UNLOCKED"
    ) {
      setIsLoading(true);
      return;
    }

    setIsLoading(true);

    try {
      const snapshot =
        await apiFetch<PlatformLayers>(
          "/platform/layers",
        );

      setLayers(snapshot);
    } catch {
      /**
       * Fail closed.
       *
       * Une véritable erreur réseau/API ne doit jamais rendre
       * une couche accessible par défaut.
       *
       * Ce fallback reste donc volontairement restrictif.
       */
      setLayers(fallback);
    } finally {
      setIsLoading(false);
    }
  }, [
    currentUser?.id,
    sessionSecurityState,
  ]);

  /**
   * Recharge automatiquement les couches lorsque :
   *
   * - l'utilisateur change ;
   * - la session passe de LOCKED à UNLOCKED.
   *
   * C'est notamment cette transition qui permet de charger CORE
   * immédiatement après une validation correcte du PIN.
   */
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value =
    useMemo<PlatformLayersContextValue>(
      () => ({
        layers,
        isLoading,

        /**
         * Une couche n'est accessible que si le serveur indique
         * explicitement :
         *
         * 1. que la configuration existe ;
         * 2. que cette couche est activée.
         */
        isEnabled: (
          layer: AuliaLayer,
        ) =>
          layers.configured &&
          layers.enabledLayers.includes(
            layer,
          ),

        refresh,
      }),
      [
        layers,
        isLoading,
        refresh,
      ],
    );

  return (
    <PlatformLayersContext.Provider
      value={value}
    >
      {children}
    </PlatformLayersContext.Provider>
  );
}

export function usePlatformLayers() {
  const context =
    useContext(
      PlatformLayersContext,
    );

  if (!context) {
    throw new Error(
      "usePlatformLayers must be used within PlatformLayersProvider",
    );
  }

  return context;
}