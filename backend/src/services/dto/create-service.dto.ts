import { ServiceCategory } from '@prisma/client';
import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateServiceDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isParamedical?: boolean;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  /** Required for a free-standing catalog service. A department-linked
   * service obtains this value from the structured DepartmentType. */
  @IsOptional()
  @IsEnum(ServiceCategory)
  category?: ServiceCategory;
}
