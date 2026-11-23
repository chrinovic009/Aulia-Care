import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UnitExamReconciliationService } from './unit-exam-reconciliation.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('billing/unit-exams')
export class UnitExamReconciliationController {
  constructor(private readonly reconciliation: UnitExamReconciliationService) {}

  /** Exams requested by care units and their invoices: performed but unpaid, unpaid, missing invoice. */
  @Get('reconciliation')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN', 'CASHIER')
  report(@Query('days') days: string | undefined, @Request() req: { user?: { userId?: string } }) {
    return this.reconciliation.report(Number(days) || 30, req.user);
  }
}
