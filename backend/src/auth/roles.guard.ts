import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { ROLES_KEY } from './roles.decorator';

// Suppression de la fonction normalize inutilisée qui causait l'erreur de RegExp.
// Si tu en as besoin plus tard, utilise : new RegExp('[\\x00-\\x1F]') pour éviter l'erreur ESLint.

type Responsibility = { service?: { name?: string | null } | null; department?: { name?: string | null } | null };
type RequestActor = { role?: string | null; serviceResponsabilites?: Responsibility[]; departmentResponsabilites?: Responsibility[] };

const isLabManager = (user: RequestActor) => {
  const names = [
    ...(Array.isArray(user.serviceResponsabilites) ? user.serviceResponsabilites.map((item) => item.service?.name) : []),
    ...(Array.isArray(user.departmentResponsabilites) ? user.departmentResponsabilites.map((item) => item.department?.name) : []),
  ];
  return names.some((name) => String(name || '').toLowerCase().includes('laboratoire'));
};

/** Institution Super Admin is not a care-team role. Administrative and
 * financial dashboards stay available, while direct patient-care endpoints
 * require the operational role explicitly assigned to the human actor. */
const isDirectClinicalRoute = (path: string) => /^\/api\/(patients|consultations|hospitalizations|laboratory|imaging|pharmacy|surgery)(?:\/|$)/.test(path.split('?')[0]);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles) {
      return true;
    }
    const request = context.switchToHttp().getRequest();
    const user = request.user as RequestActor | undefined;
    if (!user) return false;

    if (user.role === 'SUPER_ADMIN' && isDirectClinicalRoute(String(request.path || request.url || ''))) {
      throw new ForbiddenException('Le Super Admin institutionnel ne peut pas accéder directement aux actes ni aux dossiers cliniques. Utilisez un compte opérationnel autorisé.');
    }

    if (user.role && requiredRoles.includes(user.role)) {
      return true;
    }

    if (requiredRoles.includes('LAB_MANAGER') && isLabManager(user)) {
      return true;
    }

    return false;
  }
}
