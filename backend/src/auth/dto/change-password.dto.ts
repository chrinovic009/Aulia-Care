import { IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString() @MinLength(1) @MaxLength(128)
  currentPassword: string;

  @IsString() @MinLength(1) @MaxLength(128)
  newPassword: string;
}

export class RequestPasswordResetDto {
  @IsString() @MinLength(1) @MaxLength(255)
  identifier: string;
}
