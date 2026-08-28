import { RoleSlug } from '@prisma/client';

/**
 * Single source of truth for institutional tenancy.  DEV is deliberately the
 * only platform-scoped account: every other account is owned by one Clinic.
 */
export const PLATFORM_ROLES = [RoleSlug.DEV] as const;

export const OPERATIONAL_ROLES = Object.values(RoleSlug).filter(
  (role): role is RoleSlug => !PLATFORM_ROLES.includes(role as (typeof PLATFORM_ROLES)[number]),
);

/** Roles that an institution administrator can create as hospital staff. */
export const STAFF_ROLES = [
  RoleSlug.RECEPTIONIST,
  RoleSlug.NURSE,
  RoleSlug.PHYSICIAN,
  RoleSlug.LAB_TECHNICIAN,
  RoleSlug.LAB_MANAGER,
  RoleSlug.RADIOLOGIST,
  RoleSlug.SURGEON,
  RoleSlug.ANESTHESIOLOGIST,
  RoleSlug.PHARMACIST,
  RoleSlug.CASHIER,
  RoleSlug.FINANCE,
] as const;

export function isPlatformRole(role?: RoleSlug | string | null): boolean {
  return Boolean(role) && PLATFORM_ROLES.includes(role as (typeof PLATFORM_ROLES)[number]);
}

export function isOperationalRole(role?: RoleSlug | string | null): boolean {
  return Boolean(role) && OPERATIONAL_ROLES.includes(role as RoleSlug);
}

export function isStaffRole(role?: RoleSlug | string | null): role is (typeof STAFF_ROLES)[number] {
  return Boolean(role) && STAFF_ROLES.includes(role as (typeof STAFF_ROLES)[number]);
}
