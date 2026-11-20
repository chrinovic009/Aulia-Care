import { RoleSlug } from '@prisma/client';

/**
 * Single source of truth for institutional tenancy. DEV is platform-scoped;
 * PATIENT is a portal identity scoped by Patient.portalUserId. Every hospital
 * operator is owned by exactly one Clinic.
 */
export const PLATFORM_ROLES = [RoleSlug.DEV] as const;

/** Portal identities are authorised through Patient.portalUserId, not a User clinicId. */
export const PORTAL_ROLES = [RoleSlug.PATIENT] as const;

export const OPERATIONAL_ROLES = Object.values(RoleSlug).filter(
  (role): role is RoleSlug =>
    !PLATFORM_ROLES.includes(role as (typeof PLATFORM_ROLES)[number]) &&
    !PORTAL_ROLES.includes(role as (typeof PORTAL_ROLES)[number]),
);

/** Explicit exhaustive classification prevents silently granting new roles as staff. */
export const ROLE_KIND = {
  DEV: 'platform', PATIENT: 'portal', SUPER_ADMIN: 'administrator', ADMIN: 'administrator',
  MEDICAL_DIRECTOR: 'additional', RECEPTIONIST: 'staff', NURSE: 'staff', PHYSICIAN: 'staff',
  LAB_TECHNICIAN: 'staff', LAB_MANAGER: 'staff', RADIOLOGIST: 'staff', SURGEON: 'staff',
  ANESTHESIOLOGIST: 'staff', PHARMACIST: 'staff', CASHIER: 'staff', FINANCE: 'staff',
  PARAMEDIC: 'staff', DISPATCHER: 'staff', MIDWIFE: 'staff',
} as const satisfies Record<RoleSlug, 'platform' | 'portal' | 'administrator' | 'additional' | 'staff'>;
export const STAFF_ROLES = Object.values(RoleSlug).filter(role => ROLE_KIND[role] === 'staff');

export function isPlatformRole(role?: RoleSlug | string | null): boolean {
  return Boolean(role) && PLATFORM_ROLES.includes(role as (typeof PLATFORM_ROLES)[number]);
}

export function isOperationalRole(role?: RoleSlug | string | null): boolean {
  return Boolean(role) && OPERATIONAL_ROLES.includes(role as RoleSlug);
}

export function isPortalRole(role?: RoleSlug | string | null): boolean {
  return Boolean(role) && PORTAL_ROLES.includes(role as (typeof PORTAL_ROLES)[number]);
}

export function isStaffRole(role?: RoleSlug | string | null): role is (typeof STAFF_ROLES)[number] {
  return Boolean(role) && STAFF_ROLES.includes(role as (typeof STAFF_ROLES)[number]);
}
