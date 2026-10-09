import { MedicationFrequency, MedicationRoute } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested } from 'class-validator';

export class PrescriptionLineDto {
  @IsUUID() medicationId: string;
  @IsOptional() @IsString() @MaxLength(250) dosage?: string;
  @IsOptional() @IsEnum(MedicationRoute) route?: MedicationRoute;
  @IsOptional() @IsEnum(MedicationFrequency) frequency?: MedicationFrequency;
  @Type(() => Number) @IsInt() @Min(1) quantity: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) durationDays?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) unitPrice?: number;
  @IsOptional() @IsString() @MaxLength(1_000) notes?: string;
}

export class CreatePrescriptionDto {
  @IsOptional() @IsString() @MaxLength(4_000) instruction?: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => PrescriptionLineDto)
  lines: PrescriptionLineDto[];
}

/** A correction of a billed prescription. The original prescription stays immutable. */
export class RequestPrescriptionReplacementDto extends CreatePrescriptionDto {
  @IsString() @MaxLength(2_000)
  reason: string;
}

export class ReviewPrescriptionReplacementDto {
  @IsString() @IsIn(['APPROVED', 'REJECTED'])
  decision: 'APPROVED' | 'REJECTED';

  @IsOptional() @IsString() @MaxLength(2_000)
  note?: string;
}
