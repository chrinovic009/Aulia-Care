import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { ROLES_KEY } from './roles.decorator';

// Suppression de la fonction normalize inutilisée qui causait l'erreur de RegExp.
// Si tu en as besoin plus tard, utilise : new RegExp('[\\x00-\\x1F]') pour éviter l'erreur ESLint.

const isLabManager = (user: any) => {
  const serviceResponsibilities = user?.serviceResponsabilites || [];
  const departmentResponsibilities = user?.departmentResponsabilites || [];

  const combined = [] as any[];
  if (Array.isArray(serviceResponsibilities)) combined.push(...serviceResponsibilities.map((r: any) => ({ name: r?.service?.name }))); 
  if (Array.isArray(departmentResponsibilities)) combined.push(...departmentResponsibilities.map((r: any) => ({ name: r?.department?.name })));

  if (!Array.isArray(combined)) return false;
  return combined.some((responsibility: any) => String(responsibility?.name || '').toLowerCase().includes('laboratoire'));
};

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
    const user = request.user;
    if (!user) return false;

    if (requiredRoles.includes(user.role)) {
      return true;
    }

    if (requiredRoles.includes('LAB_MANAGER') && isLabManager(user)) {
      return true;
    }

    return false;
  }
}