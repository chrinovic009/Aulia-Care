import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateLabCategoryDto {
  @IsOptional()
  @IsString()
  sectionId?: string;

  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  order?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
