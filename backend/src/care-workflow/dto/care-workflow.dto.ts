import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export const CARE_UNIT_KINDS = [
  'EMERGENCY', 'AMBULANCE', 'SURGERY', 'MATERNITY', 'NEONATAL', 'DIALYSIS',
  'HOSPITALIZATION', 'CONSULTATION', 'LABORATORY', 'IMAGING', 'PHARMACY', 'OTHER',
] as const;
export const CARE_UNIT_ROLES = ['MEMBER', 'LEAD', 'READ_ONLY'] as const;
export const CARE_PRIORITIES = ['ROUTINE', 'URGENT', 'ASAP', 'STAT'] as const;
export const EPISODE_STATUSES = ['PLANNED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED', 'ENTERED_IN_ERROR'] as const;
export const REQUEST_STATUSES = ['DRAFT', 'ACTIVE', 'ON_HOLD', 'REVOKED', 'COMPLETED', 'ENTERED_IN_ERROR'] as const;
export const REQUEST_INTENTS = ['PROPOSAL', 'PLAN', 'ORDER'] as const;
export const TASK_STATUSES = [
  'REQUESTED', 'RECEIVED', 'ACCEPTED', 'REJECTED', 'READY', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED', 'FAILED',
] as const;

const REASON_MAX = 2_000;

// --------------------------------------------------------------------------- units (administration)

export class CreateCareUnitDto {
  @IsIn(CARE_UNIT_KINDS) kind: (typeof CARE_UNIT_KINDS)[number];
  @IsString() @Matches(/^[A-Z0-9][A-Z0-9_-]{1,31}$/, { message: 'Code en majuscules, chiffres, - ou _ (2 à 32 caractères).' }) code: string;
  @IsString() @MinLength(2) @MaxLength(120) name: string;
  @IsOptional() @IsObject() settings?: Record<string, unknown>;
}

export class UpdateCareUnitDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsObject() settings?: Record<string, unknown>;
}

export class UpsertCareUnitAssignmentDto {
  @IsUUID() userId: string;
  @IsIn(CARE_UNIT_ROLES) unitRole: (typeof CARE_UNIT_ROLES)[number];
  @IsBoolean() active: boolean;
  @IsOptional() @IsDateString() endsAt?: string;
}

// --------------------------------------------------------------------------- shared

class VersionedDto {
  @Type(() => Number) @IsInt() @Min(1) version: number;
}

// --------------------------------------------------------------------------- episodes

export class OpenEpisodeDto {
  @IsUUID() careUnitId: string;
  @IsUUID() patientId: string;
  @IsOptional() @IsIn(CARE_PRIORITIES) priority?: (typeof CARE_PRIORITIES)[number];
  @IsOptional() @IsString() @MaxLength(REASON_MAX) reason?: string;
  @IsOptional() @IsString() @MaxLength(64) stage?: string;
  @IsOptional() @IsString() @MaxLength(120) locationLabel?: string;
  @IsOptional() @IsDateString() plannedAt?: string;
  @IsOptional() @IsUUID() sourceRequestId?: string;
  @IsOptional() @IsUUID() parentEpisodeId?: string;
  /** Start the stay immediately (IN_PROGRESS) instead of planning it. */
  @IsOptional() @IsBoolean() start?: boolean;
}

export class ChangeEpisodeStatusDto extends VersionedDto {
  @IsIn(EPISODE_STATUSES) status: (typeof EPISODE_STATUSES)[number];
  @IsOptional() @IsString() @MaxLength(REASON_MAX) reason?: string;
  @IsOptional() @IsString() @MaxLength(120) outcome?: string;
  @IsOptional() @IsObject() outcomeDetail?: Record<string, unknown>;
}

export class UpdateEpisodeDto extends VersionedDto {
  @IsOptional() @IsString() @MaxLength(64) stage?: string;
  @IsOptional() @IsIn(CARE_PRIORITIES) priority?: (typeof CARE_PRIORITIES)[number];
  @IsOptional() @IsString() @MaxLength(120) locationLabel?: string;
  /** null releases the responsibility. */
  @IsOptional() @IsUUID() responsibleUserId?: string | null;
  @IsOptional() @IsBoolean() releaseResponsible?: boolean;
  @IsOptional() @IsString() @MaxLength(REASON_MAX) reason?: string;
}

// --------------------------------------------------------------------------- service requests

export class CreateServiceRequestDto {
  @IsUUID() patientId: string;
  @IsOptional() @IsUUID() episodeId?: string;
  @IsOptional() @IsUUID() requesterUnitId?: string;
  @IsUUID() performerUnitId: string;
  @IsString() @MinLength(2) @MaxLength(64) category: string;
  @IsString() @MinLength(1) @MaxLength(64) code: string;
  @IsString() @MinLength(2) @MaxLength(255) label: string;
  @IsOptional() @IsString() @MaxLength(REASON_MAX) reason?: string;
  @IsOptional() @IsIn(CARE_PRIORITIES) priority?: (typeof CARE_PRIORITIES)[number];
  @IsOptional() @IsIn(REQUEST_INTENTS) intent?: (typeof REQUEST_INTENTS)[number];
  @IsOptional() @IsDateString() desiredAt?: string;
  @IsOptional() @IsObject() details?: Record<string, unknown>;
  /** Save as draft (to validate) instead of sending it to the performing unit. */
  @IsOptional() @IsBoolean() draft?: boolean;
}

export class ChangeServiceRequestStatusDto extends VersionedDto {
  @IsIn(REQUEST_STATUSES) status: (typeof REQUEST_STATUSES)[number];
  @IsOptional() @IsString() @MaxLength(REASON_MAX) reason?: string;
}

// --------------------------------------------------------------------------- tasks

export class ChangeTaskStatusDto extends VersionedDto {
  @IsIn(TASK_STATUSES) status: (typeof TASK_STATUSES)[number];
  @IsOptional() @IsString() @MaxLength(REASON_MAX) reason?: string;
}

export class AssignTaskDto extends VersionedDto {
  @IsOptional() @IsUUID() ownerUserId?: string | null;
  @IsOptional() @IsString() @MaxLength(REASON_MAX) reason?: string;
}

// --------------------------------------------------------------------------- events

export class RecordCareEventDto {
  @IsUUID() careUnitId: string;
  @IsOptional() @IsUUID() patientId?: string;
  @IsOptional() @IsUUID() episodeId?: string;
  @IsOptional() @IsUUID() requestId?: string;
  @IsOptional() @IsUUID() taskId?: string;
  @IsString() @Matches(/^[A-Z][A-Z0-9_]{1,63}$/, { message: 'Type d’événement en majuscules (ex. TRIAGE).' }) type: string;
  @IsString() @MinLength(2) @MaxLength(500) summary: string;
  @IsOptional() @IsObject() payload?: Record<string, unknown>;
  @IsOptional() @IsDateString() occurredAt?: string;
  @IsOptional() @IsBoolean() requiresValidation?: boolean;
}

export class CorrectCareEventDto {
  @IsString() @MinLength(2) @MaxLength(REASON_MAX) reason: string;
  /** Retract the event (ENTERED_IN_ERROR) instead of replacing it. */
  @IsOptional() @IsBoolean() retract?: boolean;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(500) summary?: string;
  @IsOptional() @IsObject() payload?: Record<string, unknown>;
}

export class ValidateCareEventDto {
  @IsOptional() @IsString() @MaxLength(REASON_MAX) comment?: string;
}

// --------------------------------------------------------------------------- transfers

export class SendTransferDto {
  @IsUUID() patientId: string;
  @IsOptional() @IsUUID() fromUnitId?: string;
  @IsOptional() @IsUUID() fromEpisodeId?: string;
  @IsUUID() toUnitId: string;
  @IsOptional() @IsUUID() requestId?: string;
  @IsString() @MinLength(2) @MaxLength(REASON_MAX) reason: string;
  /** Structured hand-off content (observations, care given, medications, key information...). */
  @IsObject() summary: Record<string, unknown>;
}

export class TransferEpisodeDto {
  @IsOptional() @IsIn(CARE_PRIORITIES) priority?: (typeof CARE_PRIORITIES)[number];
  @IsOptional() @IsString() @MaxLength(REASON_MAX) reason?: string;
  @IsOptional() @IsString() @MaxLength(120) locationLabel?: string;
}

export class DecideTransferDto extends VersionedDto {
  @IsIn(['ACCEPT', 'REJECT']) decision: 'ACCEPT' | 'REJECT';
  @IsOptional() @IsString() @MaxLength(REASON_MAX) reason?: string;
  /** On acceptance, the receiving unit's episode is opened with these values. */
  @IsOptional() @ValidateNested() @Type(() => TransferEpisodeDto) episode?: TransferEpisodeDto;
}

export class VersionOnlyDto extends VersionedDto {}

export class CancelTransferDto extends VersionedDto {
  @IsString() @MinLength(2) @MaxLength(REASON_MAX) reason: string;
}
