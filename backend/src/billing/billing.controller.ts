import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
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

  @Post('patients/:patientId/authorize-discharge')
  @Roles('SUPER_ADMIN', 'ADMIN', 'CASHIER')
  authorizePatientDischarge(@Param('patientId') patientId: string) {
    return this.billingService.authorizePatientDischarge(patientId);
  }
}
