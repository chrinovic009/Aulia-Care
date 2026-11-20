import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
export class ConfigurePacsDto {
  @IsBoolean() enabled: boolean;
  @IsString() @MaxLength(2048) previewUrlTemplate: string;
  @IsOptional() @IsString() @MaxLength(4096) token?: string;
  @IsOptional() @IsBoolean() clearToken?: boolean;
}