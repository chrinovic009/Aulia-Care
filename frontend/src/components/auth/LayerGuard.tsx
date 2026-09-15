import { useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "../../context/AuthContext";
import { type AuliaLayer, usePlatformLayers } from "../../context/PlatformLayersContext";
import { layersForPath } from "../../config/auliaCapabilities";
import { LayerLockedPanel } from "./LayerLockedPanel";

export function LayerGuard({ layer, children }: { layer: AuliaLayer | AuliaLayer[]; children: ReactNode }) {
  useAuth();
  const { isLoading, isEnabled } = usePlatformLayers();
  // Never render a premium screen from the permissive initial context while
  // the authenticated configuration is still being fetched.
  if (isLoading) return <div className="grid min-h-[40vh] place-items-center text-sm text-slate-500 dark:text-slate-300">Vérification des couches Aulia Care…</div>;
  const required = Array.isArray(layer) ? layer : [layer];
  if (required.every(isEnabled)) return <>{children}</>;
  return <LayerLockedPanel required={required} />;
}

/** Applies the same default-Core classification to every protected UI route. */
export function LayerRouteGate({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { currentUser } = useAuth();
  const { isLoading, isEnabled } = usePlatformLayers();
  const required = layersForPath(location.pathname);
  if (isLoading) return <div className="grid min-h-screen place-items-center text-sm text-slate-500 dark:text-slate-300">Application de la configuration Aulia Care…</div>;
  if (!required || required.every(isEnabled)) return <>{children}</>;
  if (currentUser?.primaryRole === "DEV") return <LayerLockedPanel required={required} />;
  return <LayerLockedPanel required={required} />;
}
