import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  Min,
} from 'class-validator';

export class ConfigureClinicLabTestDto {
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  turnaroundTimeMinutes?: number | null;
}