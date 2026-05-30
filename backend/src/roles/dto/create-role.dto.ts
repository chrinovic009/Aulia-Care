import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { RoleSlug } from '@prisma/client';

export class CreateRoleDto {
  @IsEnum(RoleSlug)
  slug: RoleSlug;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  description: string;
}
