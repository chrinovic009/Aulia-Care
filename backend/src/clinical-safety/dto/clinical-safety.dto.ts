import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

export class RecordAllergyDto {
  @IsString() @MinLength(3) @MaxLength(200) substance: string;
  @IsOptional() @IsString() @MaxLength(500) reaction?: string;
  @IsIn(['MILD', 'MODERATE', 'SEVERE']) severity: 'MILD' | 'MODERATE' | 'SEVERE';
  @IsOptional() @IsString() @MaxLength(2_000) notes?: string;
}

export class ResolveAllergyDto {
  @IsString() @MinLength(10) @MaxLength(2_000) reason: string;
}

export class ProposeInteractionRuleDto {
  @IsString() @MinLength(3) @MaxLength(200) substanceA: string;
  @IsString() @MinLength(3) @MaxLength(200) substanceB: string;
  @IsIn(['MINOR', 'MODERATE', 'MAJOR', 'CONTRAINDICATED']) severity: 'MINOR' | 'MODERATE' | 'MAJOR' | 'CONTRAINDICATED';
  @IsString() @MinLength(5) @MaxLength(2_000) effect: string;
  @IsOptional() @IsString() @MaxLength(2_000) recommendation?: string;
  @IsString() @MinLength(3) @MaxLength(500) source: string;
}

export class RuleDecisionDto {
  @IsOptional() @IsString() @MaxLength(2_000) reason?: string;
}

export class RetireRuleDto {
  @IsString() @MinLength(10) @MaxLength(2_000) reason: string;
}

export class UpdateMedicationIdentityDto {
  @IsOptional() @IsString() @MaxLength(200) activeSubstance?: string;
  @IsOptional() @IsString() @Matches(/^[A-Za-z]\d{2}[A-Za-z0-9]{0,4}$/, { message: 'Code ATC invalide.' }) atcCode?: string;
}

export class CheckPrescriptionDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @IsUUID('all', { each: true }) medicationIds: string[];
}
