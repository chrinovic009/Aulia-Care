import { Body, Controller, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import {
  ExtractedCompanyImportInput,
  SubscriptionAdmissionInput,
  SubscriptionChargeInput,
  SubscriptionCompanyInput,
  SubscriptionEmployeeInput,
  SubscriptionsService,
} from './subscriptions.service';

interface AuthenticatedRequest {
  user?: { userId?: string; id?: string };
}

const actorIdFrom = (request: AuthenticatedRequest) => request.user?.userId || request.user?.id;

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get('companies')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'CASHIER')
  findCompanies(@Request() request: AuthenticatedRequest) {
    return this.subscriptionsService.findCompanies(actorIdFrom(request));
  }

  @Post('companies')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST')
  createCompany(@Body() body: SubscriptionCompanyInput, @Request() request: AuthenticatedRequest) {
    return this.subscriptionsService.createCompany(body, actorIdFrom(request));
  }

  @Post('companies/import-extracted')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST')
  importExtractedCompany(@Body() body: ExtractedCompanyImportInput, @Request() request: AuthenticatedRequest) {
    return this.subscriptionsService.importExtractedCompany(body, actorIdFrom(request));
  }

  @Get('companies/:id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'CASHIER')
  getCompany(@Param('id') id: string, @Request() request: AuthenticatedRequest) {
    return this.subscriptionsService.getCompany(id, actorIdFrom(request));
  }

  @Patch('companies/:id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST')
  updateCompany(@Param('id') id: string, @Body() body: SubscriptionCompanyInput, @Request() request: AuthenticatedRequest) {
    return this.subscriptionsService.updateCompany(id, body, actorIdFrom(request));
  }

  @Post('companies/:id/employees')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST')
  createEmployee(@Param('id') id: string, @Body() body: SubscriptionEmployeeInput, @Request() request: AuthenticatedRequest) {
    return this.subscriptionsService.createEmployee(id, body, actorIdFrom(request));
  }

  @Get('employees/admissible')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST')
  findAdmissibleEmployees(@Query('companyId') companyId: string | undefined, @Request() request: AuthenticatedRequest) {
    return this.subscriptionsService.findAdmissibleEmployees(companyId, actorIdFrom(request));
  }

  @Post('employees/:id/admit')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST')
  admitEmployee(@Param('id') id: string, @Body() body: SubscriptionAdmissionInput, @Request() request: AuthenticatedRequest) {
    return this.subscriptionsService.admitEmployee(id, body, actorIdFrom(request));
  }

  @Post('charges')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'CASHIER')
  createCharge(@Body() body: SubscriptionChargeInput, @Request() request: AuthenticatedRequest) {
    return this.subscriptionsService.createCharge(body, actorIdFrom(request));
  }

  @Post('companies/:id/monthly-invoices')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'CASHIER')
  generateMonthlyInvoice(@Param('id') id: string, @Body() body: { year?: number | string; month?: number | string }, @Request() request: AuthenticatedRequest) {
    const now = new Date();
    return this.subscriptionsService.generateMonthlyInvoice(
      id,
      Number(body.year || now.getFullYear()),
      Number(body.month || now.getMonth() + 1),
      actorIdFrom(request),
    );
  }
}
