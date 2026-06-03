import { ReactNode } from "react";
import { Navigate } from "react-router";
import { useAuth, RoleSlug } from "../../context/AuthContext";

interface RoleGuardProps {
  children: ReactNode;
  requiredRoles: RoleSlug[];
}

export default function RoleGuard({ children, requiredRoles }: RoleGuardProps) {
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
    // Rôle non autorisé, rediriger vers le dashboard
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
