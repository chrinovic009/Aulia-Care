import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpsertSurgerySafetyChecklistDto {
  @IsBoolean() identityConfirmed: boolean;
  @IsBoolean() procedureSiteConfirmed: boolean;
  @IsBoolean() consentConfirmed: boolean;
  @IsBoolean() anesthesiaCheckDone: boolean;
  @IsBoolean() antibioticProphylaxis: boolean;
  @IsBoolean() imagingAvailable: boolean;
  @IsBoolean() instrumentCountCorrect: boolean;
  @IsBoolean() specimenLabelled: boolean;
  @IsOptional() @IsString() @MaxLength(2_000) notes?: string;
}
