import React from "react";
import { useEffect } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { Modal } from "../ui/modal";
import {
  RoleSlug,
  useAuth,
  getRedirectPath,
} from "../../context/AuthContext";

interface RequireAuthProps {
  children: React.ReactNode;
}

interface RoleGuardProps {
  children: React.ReactNode;
  allowedRoles: RoleSlug[];
}

export function RequireAuth({ children }: RequireAuthProps) {
  const { currentUser } = useAuth();
  const location = useLocation();

  if (!currentUser) {
    return <Navigate to="/signin" state={{ from: location }} replace />;
  }

  return children;
}

export function RoleGuard({ children, allowedRoles }: RoleGuardProps) {
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (currentUser && !allowedRoles.includes(currentUser.role)) {
      const timer = window.setTimeout(() => {
        navigate(getRedirectPath(currentUser.role), { replace: true });
      }, 1800);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [allowedRoles, currentUser, navigate]);

  if (!currentUser) {
    return <Navigate to="/signin" replace />;
  }

  if (!allowedRoles.includes(currentUser.role)) {
    return (
      <Modal
        isOpen={true}
        onClose={() => navigate(getRedirectPath(currentUser.role), { replace: true })}
        showCloseButton={false}
      >
        <div className="p-8 text-center">
          <h2 className="mb-3 text-xl font-semibold text-gray-900 dark:text-white">
            Accès refusé
          </h2>
          <p className="mb-4 text-sm text-gray-600 dark:text-gray-300">
            Cette interface n’est pas accessible avec votre rôle actuel.
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Vous allez être redirigé automatiquement vers votre espace sécurisé.
          </p>
        </div>
      </Modal>
    );
  }

  return children;
}

export function HomeRedirect() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (currentUser) {
      navigate(getRedirectPath(currentUser.role), { replace: true });
    }
  }, [currentUser, navigate]);

  return null;
}
