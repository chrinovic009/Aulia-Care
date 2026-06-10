import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
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

  if (!requiredRoles.includes(currentUser.primaryRole)) {
    return <Navigate to={getRedirectPath(currentUser.primaryRole)} replace />;
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
