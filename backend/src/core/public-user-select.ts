import { Prisma } from '@prisma/client';

/** Fields allowed when an operational response embeds a staff User relation. */
export const PUBLIC_USER_SELECT = {
  id: true,
  clinicId: true,
  displayName: true,
  firstName: true,
  lastName: true,
  username: true,
  email: true,
  primaryRole: true,
  specialty: true,
  phone: true,
  profilePhotoUrl: true,
  status: true,
} as const satisfies Prisma.UserSelect;
