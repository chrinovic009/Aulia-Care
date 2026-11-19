import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class AmendImagingReportDto {
  @IsString()
  @MinLength(3)
  reason!: string;

  @IsString()
  @MinLength(1)
  findings!: string;

  @IsString()
  @MinLength(1)
  impression!: string;

  @IsOptional()
  @IsString()
  recommendations?: string;

  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
