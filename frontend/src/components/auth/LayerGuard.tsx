import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { getRedirectPath, useAuth } from "../../context/AuthContext";
import { type AuliaLayer, usePlatformLayers } from "../../context/PlatformLayersContext";

export function LayerGuard({ layer, children }: { layer: AuliaLayer | AuliaLayer[]; children: ReactNode }) {
  const { currentUser } = useAuth();
  const { isLoading, isEnabled } = usePlatformLayers();
  if (isLoading) return <div className="grid min-h-[40vh] place-items-center text-sm text-slate-500 dark:text-slate-300">Vérification des couches Aulia Care…</div>;
  const required = Array.isArray(layer) ? layer : [layer];
  if (required.every(isEnabled)) return <>{children}</>;
  return <Navigate to={getRedirectPath(currentUser?.primaryRole || "PATIENT")} replace />;
}

const layersForPath = (pathname: string): AuliaLayer[] | null => {
  if (pathname.startsWith("/dev/")) return null;
  if (["/montre-connectee", "/enfants", "/reception/montres", "/administration/montres"].some((path) => pathname.startsWith(path))) return ["CONNECTED"];
  if (pathname.startsWith("/suivi-quotidien")) return ["AI"];
  return ["CORE"];
};

/** Applies the same default-Core classification to every protected UI route. */
export function LayerRouteGate({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { currentUser } = useAuth();
  const { isLoading, isEnabled } = usePlatformLayers();
  const required = layersForPath(location.pathname);
  if (!required || required.every(isEnabled)) return <>{children}</>;
  if (isLoading) return <div className="grid min-h-screen place-items-center text-sm text-slate-500 dark:text-slate-300">Application de la configuration Aulia Care…</div>;
  if (currentUser?.primaryRole === "DEV") return <Navigate to="/dev/couches" replace />;
  return <main className="grid min-h-[70vh] place-items-center px-5 text-center"><div className="max-w-md rounded-3xl border border-aulia-teal/25 bg-white p-7 shadow-sm dark:bg-slate-900"><p className="text-sm font-semibold text-aulia-teal">Couche non activée</p><h1 className="mt-2 text-xl font-bold text-slate-900 dark:text-white">Cette interface n’est pas disponible dans cette installation</h1><p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">Vous devez passer à l’abonnement {required.join(" + ")} pour utiliser les montres connectées</p></div></main>;
}
