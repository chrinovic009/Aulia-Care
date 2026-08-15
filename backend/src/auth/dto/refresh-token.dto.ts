import { IsOptional, IsString } from 'class-validator';

export class RefreshTokenDto {
  // Legacy body support only. Browser clients use the HttpOnly refresh cookie.
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
