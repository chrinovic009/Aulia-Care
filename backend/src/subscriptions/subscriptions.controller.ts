import { Body, Controller, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { SubscriptionsService } from './subscriptions.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get('companies')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'CASHIER')
  findCompanies() {
    return this.subscriptionsService.findCompanies();
  }

  @Post('companies')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST')
  createCompany(@Body() body: any) {
    return this.subscriptionsService.createCompany(body);
  }

  @Get('companies/:id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'CASHIER')
  getCompany(@Param('id') id: string) {
    return this.subscriptionsService.getCompany(id);
  }

  @Patch('companies/:id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST')
  updateCompany(@Param('id') id: string, @Body() body: any) {
    return this.subscriptionsService.updateCompany(id, body);
  }

  @Post('companies/:id/employees')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST')
  createEmployee(@Param('id') id: string, @Body() body: any) {
    return this.subscriptionsService.createEmployee(id, body);
  }

  @Get('employees/admissible')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST')
  findAdmissibleEmployees(@Query('companyId') companyId?: string) {
    return this.subscriptionsService.findAdmissibleEmployees(companyId);
  }

  @Post('employees/:id/admit')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST')
  admitEmployee(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.subscriptionsService.admitEmployee(id, body, req.user?.userId || req.user?.id);
  }

  @Post('charges')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'CASHIER')
  createCharge(@Body() body: any) {
    return this.subscriptionsService.createCharge(body);
  }

  @Post('companies/:id/monthly-invoices')
  @Roles('SUPER_ADMIN', 'ADMIN', 'CASHIER')
  generateMonthlyInvoice(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    const now = new Date();
    return this.subscriptionsService.generateMonthlyInvoice(
      id,
      Number(body.year || now.getFullYear()),
      Number(body.month || now.getMonth() + 1),
      req.user?.userId || req.user?.id,
    );
  }
}
