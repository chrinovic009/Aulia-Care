import { Body, Controller, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { BillingService } from './billing.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('invoices')
  @Roles('SUPER_ADMIN', 'ADMIN', 'CASHIER')
  findInvoices() {
    return this.billingService.findInvoices();
  }

  @Get('payments')
  @Roles('SUPER_ADMIN', 'ADMIN', 'CASHIER')
  findPayments() {
    return this.billingService.findPayments();
  }

  @Get('payments/:id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'CASHIER')
  findPayment(@Param('id') id: string) {
    return this.billingService.findPayment(id);
  }

  @Get('forecast')
  @Roles('SUPER_ADMIN', 'ADMIN', 'CASHIER')
  financialForecast() { return this.billingService.financialForecast(); }

  @Get('patients/:patientId/summary')
  @Roles('SUPER_ADMIN', 'ADMIN', 'CASHIER')
  getPatientBillingSummary(@Param('patientId') patientId: string) {
    return this.billingService.getPatientBillingSummary(patientId);
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
  @Roles('SUPER_ADMIN', 'ADMIN')
  reviewInvoiceDiscount(@Param('requestId') requestId: string, @Body() body: { approved: boolean; reviewNote?: string }, @Request() req: any) {
    return this.billingService.reviewInvoiceDiscount(requestId, Boolean(body.approved), req.user?.userId, body.reviewNote);
  }

  @Post('patients/:patientId/authorize-discharge')
  @Roles('SUPER_ADMIN', 'ADMIN', 'CASHIER')
  authorizePatientDischarge(@Param('patientId') patientId: string) {
    return this.billingService.authorizePatientDischarge(patientId);
  }
}
