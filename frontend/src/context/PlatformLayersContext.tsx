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
  enabledLayers: ["CORE"],
  availableLayers: ["CORE"],
  configurationVersion: 0,
  configuredAt: null,
  updatedAt: null,
};

type PlatformLayersContextValue = {
  layers: PlatformLayers;
  isLoading: boolean;
  isEnabled: (layer: AuliaLayer) => boolean;
  refresh: () => Promise<void>;
  save: (enabledLayers: AuliaLayer[]) => Promise<PlatformLayers>;
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

  const save = useCallback(async (enabledLayers: AuliaLayer[]) => {
    const saved = await apiFetch<PlatformLayers>("/platform/layers", {
      method: "PUT",
      body: JSON.stringify({ layers: enabledLayers }),
    });
    setLayers(saved);
    window.dispatchEvent(new CustomEvent("aulia:platform-layers-updated", { detail: saved }));
    return saved;
  }, []);

  const value = useMemo(() => ({
    layers,
    isLoading,
    // Core is intentionally permanent. Optional layers must fail closed: a
    // loading, expired-session or network error must never reveal AI/Connected
    // functionality simply because the configuration could not be read.
    isEnabled: (layer: AuliaLayer) => layer === "CORE" || (layers.configured && layers.enabledLayers.includes(layer)),
    refresh,
    save,
  }), [layers, isLoading, refresh, save]);

  return <PlatformLayersContext.Provider value={value}>{children}</PlatformLayersContext.Provider>;
}

export function usePlatformLayers() {
  const context = useContext(PlatformLayersContext);
  if (!context) throw new Error("usePlatformLayers must be used within PlatformLayersProvider");
  return context;
}
