import { IsArray, IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class SaveImagingReportDto {
  @IsString()
  @MaxLength(4000)
  findings: string;

  @IsString()
  @MaxLength(2000)
  impression: string;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  recommendations?: string;

  @IsBoolean()
  @IsOptional()
  verified?: boolean;

  @IsArray()
  @IsOptional()
  imagePaths?: string[];
}
