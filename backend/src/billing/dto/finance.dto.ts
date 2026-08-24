import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export class FinancePageQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number = 10;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
}

export class CreateFinanceBudgetDto {
  @IsString() @MaxLength(140) name!: string;
  @IsOptional() @IsString() departmentId?: string;
  @Type(() => Number) @IsInt() @Min(2020) @Max(2200) fiscalYear!: number;
  @IsOptional() @IsIn(['OPERATING', 'REVENUE_TARGET']) type?: 'OPERATING' | 'REVENUE_TARGET';
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) allocatedAmount!: number;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class CreateBudgetAllocationDto {
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) amount!: number;
  @IsString() @MaxLength(180) label!: string;
  @IsIn(['SUPPLIER_INVOICE', 'EXPENSE', 'SUPPORTING_DOCUMENT']) sourceKind!: 'SUPPLIER_INVOICE' | 'EXPENSE' | 'SUPPORTING_DOCUMENT';
  @IsString() @MaxLength(180) sourceReference!: string;
  @IsOptional() @IsString() expenseId?: string;
  @IsOptional() @IsString() supplierInvoiceId?: string;
  @IsOptional() @IsString() @MaxLength(1000) supportingDocumentUrl?: string;
  @IsOptional() @IsIn(['ADMISSION_FEE', 'SERVICE', 'PHARMACY', 'LABORATORY', 'RADIOLOGY', 'SURGERY', 'SUBSCRIPTION_MONTHLY', 'OTHER']) revenuePole?: string;
  @IsOptional() @IsDateString() occurredAt?: string;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

export class UpdateBudgetStatusDto {
  @IsIn(['DRAFT', 'APPROVED', 'CLOSED', 'ARCHIVED']) status!: 'DRAFT' | 'APPROVED' | 'CLOSED' | 'ARCHIVED';
}

export class CreateCapitalInvestmentDto {
  @IsString() @MaxLength(180) label!: string;
  @IsString() @MaxLength(100) category!: string;
  @IsOptional() @IsIn(['ADMISSION_FEE', 'SERVICE', 'PHARMACY', 'LABORATORY', 'RADIOLOGY', 'SURGERY', 'SUBSCRIPTION_MONTHLY', 'OTHER']) revenuePole?: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) plannedAmount!: number;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) acquiredAmount?: number;
  @IsOptional() @IsDateString() plannedAt?: string;
  @IsOptional() @IsDateString() acquiredAt?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(600) usefulLifeMonths?: number;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) expectedAnnualReturn?: number;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class UpdateCapitalInvestmentStatusDto {
  @IsIn(['PLANNED', 'APPROVED', 'ACQUIRED', 'IN_SERVICE', 'CANCELLED', 'ARCHIVED']) status!: string;
}

export class CreateBankAccountDto {
  @IsString() @MaxLength(120) bankName!: string;
  @IsString() @MaxLength(160) accountName!: string;
  @IsString() @MaxLength(80) accountNumber!: string;
  @IsOptional() @IsString() @MaxLength(8) currency?: string;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) openingBalance?: number;
  @IsOptional() @IsDateString() openingBalanceAt?: string;
}

export class UpdateBankAccountStatusDto {
  @IsIn(['ACTIVE', 'SUSPENDED', 'CLOSED']) status!: 'ACTIVE' | 'SUSPENDED' | 'CLOSED';
}

export class CreateBankStatementEntryDto {
  @IsString() @MaxLength(160) externalReference!: string;
  @IsDateString() transactionAt!: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) amount!: number;
  @IsString() @MaxLength(1000) description!: string;
  @IsOptional() rawPayload?: Record<string, unknown>;
}

export class CreateBankReconciliationDto {
  @IsString() bankStatementEntryId!: string;
  @IsOptional() @IsString() paymentId?: string;
  @IsOptional() @IsString() supplierPaymentId?: string;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

export class ReviewBankReconciliationDto {
  @IsIn(['APPROVED', 'REJECTED']) status!: 'APPROVED' | 'REJECTED';
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

export class AccountingJournalLineDto {
  @IsString() @MaxLength(32) account!: string;
  @IsString() @MaxLength(240) label!: string;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) debit?: number;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) credit?: number;
}

export class CreateAccountingJournalEntryDto {
  @IsString() @MaxLength(80) reference!: string;
  @IsDateString() occurredAt!: string;
  @IsString() @MaxLength(1000) description!: string;
  @IsIn(['MANUAL_ADJUSTMENT', 'OPENING_BALANCE']) sourceType!: 'MANUAL_ADJUSTMENT' | 'OPENING_BALANCE';
  @IsOptional() @IsString() @MaxLength(100) sourceId?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => AccountingJournalLineDto) lines!: AccountingJournalLineDto[];
}

export class CreateRefundRequestDto {
  @IsString() invoiceId!: string;
  @IsOptional() @IsString() paymentId?: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) amount!: number;
  @IsString() @MaxLength(1000) reason!: string;
}

export class ReviewRefundDto {
  @IsIn(['APPROVED', 'REJECTED', 'EXECUTED', 'CANCELLED']) status!: 'APPROVED' | 'REJECTED' | 'EXECUTED' | 'CANCELLED';
}
