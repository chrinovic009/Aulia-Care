import { IsEnum, IsOptional, IsString } from 'class-validator';
import { RoleSlug } from '@prisma/client';

export class UpdateRoleDto {
  @IsEnum(RoleSlug)
  @IsOptional()
  slug?: RoleSlug;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;
}
