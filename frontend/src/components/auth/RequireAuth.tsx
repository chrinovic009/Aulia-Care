import { ReactNode } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth, RoleSlug, getRedirectPath } from "../../context/AuthContext";

interface RequireAuthProps {
  children: ReactNode;
}

interface RoleGuardProps {
  children: ReactNode;
  requiredRoles: RoleSlug[];
}

export function RequireAuth({ children }: RequireAuthProps) {
  const { currentUser, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
          <p className="mt-4 text-gray-600">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <Navigate to="/signin" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

export function RoleGuard({ children, requiredRoles }: RoleGuardProps) {
  const { currentUser, isLoading } = useAuth();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
          <p className="mt-4 text-gray-600">Vérification des permissions...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <Navigate to="/signin" replace />;
  }

  const isLabManager = Boolean(
    currentUser.serviceResponsabilites?.some((responsibility) =>
      responsibility?.service?.name?.toLowerCase().includes('laboratoire'),
    ),
  );

  if (!requiredRoles.includes(currentUser.primaryRole) && !(requiredRoles.includes('LAB_MANAGER') && isLabManager)) {
    console.debug('RoleGuard: access denied', { requiredRoles, currentRole: currentUser?.primaryRole });
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="inline-block rounded-full bg-red-50 p-4 text-red-600">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 9v4m0 4h.01M10.3 4.3 2.9 17.1A2 2 0 0 0 4.6 20h14.8a2 2 0 0 0 1.7-2.9L13.7 4.3a2 2 0 0 0-3.4 0Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
          <h2 className="mt-4 text-xl font-semibold text-slate-900">Accès refusé</h2>
          <p className="mt-2 text-sm text-slate-600">Votre rôle actuel <strong>{currentUser?.primaryRole}</strong> n'autorise pas l'accès à cette page.</p>
          <div className="mt-4">
            <button onClick={() => navigate(getRedirectPath(currentUser?.primaryRole || "PATIENT"))} className="rounded-lg bg-slate-900 px-4 py-2 text-white">Aller au tableau de bord</button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export function HomeRedirect() {
  const { currentUser, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
          <p className="mt-4 text-gray-600">Redirection...</p>
        </div>
      </div>
    );
  }

  if (currentUser) {
    return <Navigate to={getRedirectPath(currentUser.primaryRole)} replace />;
  }

  return <Navigate to="/signin" replace />;
}
