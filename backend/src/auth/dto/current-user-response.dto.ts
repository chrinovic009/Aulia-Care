import { Expose } from 'class-transformer';
import { RoleSlug } from '@prisma/client';

export class CurrentUserResponseDto {
  @Expose()
  id: string;

  @Expose()
  email: string;

  @Expose()
  username: string;

  @Expose()
  displayName: string;

  @Expose()
  firstName: string;

  @Expose()
  lastName: string;

  @Expose()
  primaryRole: RoleSlug;

  @Expose()
  phone?: string;

  @Expose()
  specialty?: string;

  @Expose()
  gender?: string;

  @Expose()
  nationality?: string;

  @Expose()
  addressCountry?: string;

  @Expose()
  addressProvince?: string;

  @Expose()
  addressCity?: string;

  @Expose()
  addressNeighborhood?: string;

  @Expose()
  addressStreet?: string;

  @Expose()
  whatsappUrl?: string;

  @Expose()
  facebookUrl?: string;

  @Expose()
  instagramUrl?: string;

  @Expose()
  linkedinUrl?: string;

  @Expose()
  bio?: string;

  @Expose()
  profilePhotoUrl?: string;

  @Expose()
  Employee?: Array<{
    id: string;
    serviceUnitId?: string;
    departmentId?: string;
    shifts?: Array<{
      id: string;
      startAt: Date;
      endAt: Date;
      type: string;
    }>;
  }>;

  @Expose()
  serviceResponsabilites?: Array<{
    principal?: boolean;
    service?: {
      id: string;
      name: string;
      isParamedical?: boolean;
    };
  }>;

  @Expose()
  departmentResponsabilites?: Array<{
    principal?: boolean;
    department?: {
      id: string;
      name: string;
    };
  }>;

  @Expose()
  status: string;

  @Expose()
  createdAt: Date;

  @Expose()
  updatedAt: Date;
}
