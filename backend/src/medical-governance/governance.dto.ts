import { IsArray, ArrayMaxSize, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';
import { FIELD_PATHS } from './governance.rules';
export class ReferralDto {
 @IsUUID() consultationId: string;
 @IsUUID() recipientId: string;
 @IsUUID() operationId: string;
 @IsString() @MinLength(2) @MaxLength(2000) question: string;
 @IsIn(['ROUTINE','URGENT']) urgency: string;
}
export class DecisionDto {
 @IsIn(['ACCEPT','REJECT','CANCEL','COMPLETE']) action: string;
 @IsInt() @Min(1) version: number;
 @IsOptional() @IsString() @MaxLength(4000) response?: string;
}
export class DirectorGrantDto { @IsUUID() userId: string; @IsBoolean() active: boolean; }
export class PolicyDto {
 @IsString() @MaxLength(120) specialty: string;
 @IsArray() @ArrayMaxSize(8) @IsIn(FIELD_PATHS,{each:true}) required: string[];
 @IsInt() @Min(0) expectedVersion: number;
 @IsBoolean() attestation: boolean;
 @IsString() @MinLength(10) @MaxLength(2000) rationale: string;
}
