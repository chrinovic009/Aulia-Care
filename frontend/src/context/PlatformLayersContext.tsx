import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../config/api";
import { useAuth } from "./AuthContext";

export type AuliaLayer = "CORE" | "AI" | "CONNECTED";

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
  availableLayers: ["CORE", "AI", "CONNECTED"],
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

const PlatformLayersContext = createContext<PlatformLayersContextValue | undefined>(undefined);

export function PlatformLayersProvider({ children }: { children: React.ReactNode }) {
  const { currentUser } = useAuth();
  const [layers, setLayers] = useState<PlatformLayers>(fallback);
  const [isLoading, setIsLoading] = useState(Boolean(currentUser));

  const refresh = useCallback(async () => {
    if (!currentUser) {
      setLayers(fallback);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      setLayers(await apiFetch<PlatformLayers>("/platform/layers"));
    } catch {
      // The API remains the authority. Keep the safest visible fallback while
      // an expired session/network issue is handled by the global feedback.
      setLayers(fallback);
    } finally {
      setIsLoading(false);
    }
  }, [currentUser?.id]);

  useEffect(() => { void refresh(); }, [refresh]);

  const value = useMemo(() => ({
    layers,
    isLoading,
    // A missing, expired or unreadable configuration must never reveal a
    // product. All three layers are explicit entitlements of the clinic.
    isEnabled: (layer: AuliaLayer) => layers.configured && layers.enabledLayers.includes(layer),
    refresh,
  }), [layers, isLoading, refresh]);

  return <PlatformLayersContext.Provider value={value}>{children}</PlatformLayersContext.Provider>;
}

export function usePlatformLayers() {
  const context = useContext(PlatformLayersContext);
  if (!context) throw new Error("usePlatformLayers must be used within PlatformLayersProvider");
  return context;
}
