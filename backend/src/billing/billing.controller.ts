import { Controller, Get, Param, UseGuards } from '@nestjs/common';
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

  @Get('payments/:id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'CASHIER')
  findPayment(@Param('id') id: string) {
    return this.billingService.findPayment(id);
  }
}
