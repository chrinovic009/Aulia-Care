import { Body, Controller, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { BillingService } from './billing.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CreateAccountingJournalEntryDto, CreateBankAccountDto, CreateBankReconciliationDto, CreateBankStatementEntryDto, CreateBudgetAllocationDto, CreateCapitalInvestmentDto, CreateFinanceBudgetDto, CreateRefundRequestDto, ReviewBankReconciliationDto, ReviewRefundDto, UpdateBankAccountStatusDto, UpdateBudgetStatusDto, UpdateCapitalInvestmentStatusDto } from './dto/finance.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('invoices')
  @Roles('SUPER_ADMIN', 'ADMIN', 'CASHIER', 'FINANCE')
  findInvoices(@Request() req: any) {
    return this.billingService.findInvoices(req.user?.userId);
  }

  @Get('payments')
  @Roles('SUPER_ADMIN', 'ADMIN', 'CASHIER', 'FINANCE')
  findPayments(@Request() req: any) {
    return this.billingService.findPayments(req.user?.userId);
  }

  @Get('payments/:id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'CASHIER', 'FINANCE')
  findPayment(@Param('id') id: string, @Request() req: any) {
    return this.billingService.findPayment(id, req.user?.userId);
  }

  @Get('forecast')
  @Roles('SUPER_ADMIN', 'ADMIN', 'CASHIER', 'FINANCE')
  financialForecast(@Request() req: any) { return this.billingService.financialForecast(req.user?.userId); }

  @Get('finance/dashboard')
  @Roles('SUPER_ADMIN', 'ADMIN', 'FINANCE')
  financeDashboard(@Request() req: any) { return this.billingService.financeDashboard(req.user?.userId); }

  @Get('finance/treasury')
  @Roles('SUPER_ADMIN', 'ADMIN', 'FINANCE')
  financeTreasury(@Request() req: any) { return this.billingService.financeTreasury(req.user?.userId); }

  @Get('finance/banking')
  @Roles('SUPER_ADMIN', 'ADMIN', 'FINANCE')
  bankingOverview(@Request() req: any) { return this.billingService.bankingOverview(req.user?.userId); }

  @Post('finance/bank-accounts')
  @Roles('SUPER_ADMIN', 'ADMIN', 'FINANCE')
  createBankAccount(@Request() req: any, @Body() dto: CreateBankAccountDto) { return this.billingService.createBankAccount(req.user?.userId, dto); }

  @Patch('finance/bank-accounts/:bankAccountId/status')
  @Roles('SUPER_ADMIN', 'ADMIN', 'FINANCE')
  updateBankAccountStatus(@Request() req: any, @Param('bankAccountId') bankAccountId: string, @Body() dto: UpdateBankAccountStatusDto) { return this.billingService.updateBankAccountStatus(req.user?.userId, bankAccountId, dto); }

  @Post('finance/bank-accounts/:bankAccountId/statement-entries')
  @Roles('SUPER_ADMIN', 'ADMIN', 'FINANCE')
  importBankStatementEntry(@Request() req: any, @Param('bankAccountId') bankAccountId: string, @Body() dto: CreateBankStatementEntryDto) { return this.billingService.importBankStatementEntry(req.user?.userId, bankAccountId, dto); }

  @Post('finance/bank-accounts/:bankAccountId/reconciliations')
  @Roles('SUPER_ADMIN', 'ADMIN', 'FINANCE')
  proposeBankReconciliation(@Request() req: any, @Param('bankAccountId') bankAccountId: string, @Body() dto: CreateBankReconciliationDto) { return this.billingService.proposeBankReconciliation(req.user?.userId, bankAccountId, dto); }

  @Patch('finance/reconciliations/:reconciliationId')
  @Roles('SUPER_ADMIN', 'ADMIN', 'FINANCE')
  reviewBankReconciliation(@Request() req: any, @Param('reconciliationId') reconciliationId: string, @Body() dto: ReviewBankReconciliationDto) { return this.billingService.reviewBankReconciliation(req.user?.userId, reconciliationId, dto); }

  @Get('finance/journal')
  @Roles('SUPER_ADMIN', 'ADMIN', 'FINANCE')
  accountingJournal(@Request() req: any) { return this.billingService.accountingJournal(req.user?.userId); }

  @Post('finance/journal')
  @Roles('SUPER_ADMIN', 'ADMIN', 'FINANCE')
  createAccountingJournalEntry(@Request() req: any, @Body() dto: CreateAccountingJournalEntryDto) { return this.billingService.createAccountingJournalEntry(req.user?.userId, dto); }

  @Post('finance/journal/:entryId/post')
  @Roles('SUPER_ADMIN', 'ADMIN', 'FINANCE')
  postAccountingJournalEntry(@Request() req: any, @Param('entryId') entryId: string) { return this.billingService.postAccountingJournalEntry(req.user?.userId, entryId); }

  @Post('finance/refunds')
  @Roles('SUPER_ADMIN', 'ADMIN', 'FINANCE')
  createRefundRequest(@Request() req: any, @Body() dto: CreateRefundRequestDto) { return this.billingService.createRefundRequest(req.user?.userId, dto); }

  @Patch('finance/refunds/:refundId')
  @Roles('SUPER_ADMIN', 'ADMIN', 'FINANCE')
  reviewRefundRequest(@Request() req: any, @Param('refundId') refundId: string, @Body() dto: ReviewRefundDto) { return this.billingService.reviewRefundRequest(req.user?.userId, refundId, dto); }

  @Get('finance/budgets')
  @Roles('SUPER_ADMIN', 'ADMIN', 'FINANCE')
  financeBudgets(@Request() req: any) { return this.billingService.financeBudgets(req.user?.userId); }

  @Post('finance/budgets')
  @Roles('SUPER_ADMIN', 'ADMIN', 'FINANCE')
  createFinanceBudget(@Request() req: any, @Body() dto: CreateFinanceBudgetDto) { return this.billingService.createFinanceBudget(req.user?.userId, dto); }

  @Patch('finance/budgets/:budgetId/status')
  @Roles('SUPER_ADMIN', 'ADMIN', 'FINANCE')
  updateFinanceBudgetStatus(@Request() req: any, @Param('budgetId') budgetId: string, @Body() dto: UpdateBudgetStatusDto) { return this.billingService.updateFinanceBudgetStatus(req.user?.userId, budgetId, dto); }

  @Post('finance/budgets/:budgetId/allocations')
  @Roles('SUPER_ADMIN', 'ADMIN', 'FINANCE')
  createBudgetAllocation(@Request() req: any, @Param('budgetId') budgetId: string, @Body() dto: CreateBudgetAllocationDto) { return this.billingService.createBudgetAllocation(req.user?.userId, budgetId, dto); }

  @Post('finance/investments')
  @Roles('SUPER_ADMIN', 'ADMIN', 'FINANCE')
  createCapitalInvestment(@Request() req: any, @Body() dto: CreateCapitalInvestmentDto) { return this.billingService.createCapitalInvestment(req.user?.userId, dto); }

  @Patch('finance/investments/:investmentId/status')
  @Roles('SUPER_ADMIN', 'ADMIN', 'FINANCE')
  updateCapitalInvestmentStatus(@Request() req: any, @Param('investmentId') investmentId: string, @Body() dto: UpdateCapitalInvestmentStatusDto) { return this.billingService.updateCapitalInvestmentStatus(req.user?.userId, investmentId, dto); }

  @Get('patients/:patientId/summary')
  @Roles('SUPER_ADMIN', 'ADMIN', 'CASHIER', 'FINANCE')
  getPatientBillingSummary(@Param('patientId') patientId: string, @Request() req: any) {
    return this.billingService.getPatientBillingSummary(patientId, req.user?.userId);
  }

  @Patch('invoices/:invoiceId/discount')
  @Roles('SUPER_ADMIN', 'ADMIN', 'CASHIER')
  applyInvoiceDiscount(
    @Param('invoiceId') invoiceId: string,
    @Body() body: { amount: number; reason?: string },
  ) {
    return this.billingService.applyInvoiceDiscount(invoiceId, Number(body.amount), body.reason);
  }

  @Post('invoices/:invoiceId/discount-requests')
  @Roles('SUPER_ADMIN', 'ADMIN', 'CASHIER')
  requestInvoiceDiscount(@Param('invoiceId') invoiceId: string, @Body() body: { amount: number; reason: string }, @Request() req: any) {
    return this.billingService.requestInvoiceDiscount(invoiceId, Number(body.amount), body.reason, req.user?.userId);
  }

  @Post('discount-requests/:requestId/review')
  @Roles('SUPER_ADMIN', 'ADMIN', 'FINANCE')
  reviewInvoiceDiscount(@Param('requestId') requestId: string, @Body() body: { approved: boolean; reviewNote?: string }, @Request() req: any) {
    return this.billingService.reviewInvoiceDiscount(requestId, Boolean(body.approved), req.user?.userId, body.reviewNote);
  }

  @Post('patients/:patientId/authorize-discharge')
  @Roles('SUPER_ADMIN', 'ADMIN', 'CASHIER')
  authorizePatientDischarge(@Param('patientId') patientId: string) {
    return this.billingService.authorizePatientDischarge(patientId);
  }
}
