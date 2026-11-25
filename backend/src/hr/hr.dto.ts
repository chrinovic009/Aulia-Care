import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested } from 'class-validator';

export class LeaveRequestDto {
  @IsString() @MaxLength(30) type: string;
  @IsString() @MaxLength(10) startDate: string;
  @IsString() @MaxLength(10) endDate: string;
  @IsOptional() @IsString() @MaxLength(1_000) reason?: string;
  @IsOptional() @IsUUID() replacementEmployeeId?: string;
}

export class ReplacementRequestDto {
  @IsUUID() replacerId: string;
  @IsString() @MaxLength(40) startAt: string;
  @IsString() @MaxLength(40) endAt: string;
  @IsString() @MaxLength(1_000) reason: string;
}

export class ReplacementResponseDto {
  @IsBoolean() accept: boolean;
  @IsOptional() @IsString() @MaxLength(1_000) note?: string;
}

export class DecisionDto {
  @IsIn(['APPROVE', 'REJECT']) decision: 'APPROVE' | 'REJECT';
  @IsOptional() @IsString() @MaxLength(1_000) note?: string;
  /** Grant an annual leave beyond the remaining balance, knowingly. */
  @IsOptional() @IsBoolean() force?: boolean;
}

export class ContractDto {
  @IsOptional() @IsString() @MaxLength(20) type?: string;
  @IsString() @MaxLength(10) startDate: string;
  @IsOptional() @IsString() @MaxLength(10) endDate?: string | null;
  @IsNumber() @Min(0) salary: number;
  @IsOptional() @IsString() @MaxLength(3) currency?: string;
  @IsOptional() @IsString() @MaxLength(300) reason?: string;
}

export class SalaryChangeDto {
  @IsNumber() @Min(0) salary: number;
  @IsString() @MaxLength(10) effectiveDate: string;
  @IsString() @MaxLength(300) reason: string;
}

export class ContractUpdateDto {
  @IsOptional() @IsString() @MaxLength(10) endDate?: string | null;
  @IsOptional() @IsString() @MaxLength(20) type?: string;
}

export class MonthDto {
  @IsString() @MaxLength(7) month: string;
}

export class PayrollLineDto {
  @IsString() @MaxLength(20) kind: string;
  @IsString() @MaxLength(200) label: string;
  @IsNumber() amount: number;
}

export class PayrollPaymentDto {
  @IsInt() @Min(0) version: number;
  @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => PayrollLineDto) lines: PayrollLineDto[];
  @IsOptional() @IsString() @MaxLength(60) paymentMethod?: string;
  @IsOptional() @IsString() @MaxLength(120) paymentReference?: string;
  @IsOptional() @IsString() @MaxLength(1_000) notes?: string;
}

export class AbsenceDto {
  @IsUUID() employeeId: string;
  @IsString() @MaxLength(10) date: string;
  @IsOptional() @IsBoolean() justified?: boolean;
  @IsOptional() @IsString() @MaxLength(1_000) note?: string;
}

export class JustificationDto {
  @IsBoolean() justified: boolean;
  @IsOptional() @IsString() @MaxLength(1_000) note?: string;
}

export class HrPolicyDto {
  @IsInt() payDay: number;
  @IsInt() lateGraceMinutes: number;
  @IsNumber() monthlyWorkingHours: number;
  @IsInt() workingDaysPerMonth: number;
  @IsNumber() leaveDaysPerMonth: number;
  @IsInt() seniorityBonusYears: number;
  @IsArray() @ArrayMaxSize(7) @IsInt({ each: true }) workWeekDays: number[];
  /** Explicit approval of lateness/absence deductions; requires a written basis. */
  @IsOptional() @IsBoolean() approveAttendanceDeductions?: boolean;
  @IsOptional() @IsString() @MaxLength(1_000) deductionsLegalBasis?: string;
}
