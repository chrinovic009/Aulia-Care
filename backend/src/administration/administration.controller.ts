import { Body, Controller, Delete, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AdministrationService } from './administration.service';
import { UpdateClinicBrandingDto } from './dto/update-clinic-branding.dto';
import { UpdateClinicOperationalPolicyDto } from './dto/update-clinic-operational-policy.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('administration')
export class AdministrationController {
  constructor(private readonly administrationService: AdministrationService) {}

  @Get('clinic-branding')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'NURSE', 'PHYSICIAN', 'CASHIER', 'FINANCE', 'LAB_MANAGER', 'LAB_TECHNICIAN', 'RADIOLOGIST', 'PHARMACIST', 'PATIENT')
  clinicBranding(@Request() req: any) {
    return this.administrationService.getClinicBranding(req.user?.userId);
  }

  @Patch('clinic-branding')
  @Roles('SUPER_ADMIN', 'ADMIN')
  updateClinicBranding(@Request() req: any, @Body() body: UpdateClinicBrandingDto) {
    return this.administrationService.updateClinicBranding(req.user?.userId, body);
  }

  @Get('clinic-operational-policy')
  @Roles('ADMIN')
  clinicOperationalPolicy(@Request() req: any) {
    return this.administrationService.getClinicOperationalPolicy(req.user?.userId);
  }

  @Patch('clinic-operational-policy')
  @Roles('ADMIN')
  updateClinicOperationalPolicy(@Request() req: any, @Body() body: UpdateClinicOperationalPolicyDto) {
    return this.administrationService.updateClinicOperationalPolicy(req.user?.userId, body);
  }

  @Get('departments')
  @Roles('SUPER_ADMIN', 'ADMIN', 'PHYSICIAN', 'RECEPTIONIST')
  departments() {
    return this.administrationService.departments();
  }

  @Get('service-units')
  @Roles('SUPER_ADMIN', 'ADMIN', 'PHYSICIAN')
  serviceUnits() {
    return this.administrationService.serviceUnits();
  }

  @Post('departments/:id/responsables')
  @Roles('SUPER_ADMIN', 'ADMIN')
  addDepartmentResponsables(@Param('id') id: string, @Body() body: any) {
    const items = Array.isArray(body) ? body : [body];
    return this.administrationService.addDepartmentResponsables(items.map((it) => ({ ...it, departmentId: id })));
  }

  @Post('departments')
  @Roles('SUPER_ADMIN', 'ADMIN')
  createDepartment(@Body() body: any) {
    return this.administrationService.createDepartment(body);
  }

  @Patch('departments/:id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  updateDepartment(@Param('id') id: string, @Body() body: any) {
    return this.administrationService.updateDepartment(id, body);
  }

  @Delete('departments/:id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  deleteDepartment(@Param('id') id: string) {
    return this.administrationService.removeDepartment(id);
  }

  @Post('service-units')
  @Roles('SUPER_ADMIN', 'ADMIN')
  createServiceUnit(@Body() body: any) {
    return this.administrationService.createServiceUnit(body);
  }

  @Get('rooms')
  @Roles('SUPER_ADMIN', 'ADMIN')
  rooms() {
    return this.administrationService.rooms();
  }

  @Post('rooms')
  @Roles('SUPER_ADMIN', 'ADMIN')
  createRoom(@Body() body: any) {
    return this.administrationService.createRoom(body);
  }

  @Patch('rooms/:id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  updateRoom(@Param('id') id: string, @Body() body: any) {
    return this.administrationService.updateRoom(id, body);
  }

  @Delete('rooms/:id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  deleteRoom(@Param('id') id: string) {
    return this.administrationService.removeRoom(id);
  }

  @Post('beds')
  @Roles('SUPER_ADMIN', 'ADMIN')
  createBed(@Body() body: any) {
    return this.administrationService.createBed(body);
  }

  @Post('operating-rooms')
  @Roles('SUPER_ADMIN', 'ADMIN')
  createOperatingRoom(@Body() body: any) {
    return this.administrationService.createOperatingRoom(body);
  }

  @Patch('operating-rooms/:id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  updateOperatingRoom(@Param('id') id: string, @Body() body: any) {
    return this.administrationService.updateOperatingRoom(id, body);
  }

  @Delete('operating-rooms/:id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  deleteOperatingRoom(@Param('id') id: string) {
    return this.administrationService.removeOperatingRoom(id);
  }

  @Get('stock')
  @Roles('SUPER_ADMIN', 'ADMIN', 'PHARMACIST')
  stock() {
    return this.administrationService.stockCatalog();
  }

  @Post('stock/medications')
  @Roles('SUPER_ADMIN', 'PHARMACIST', 'PHYSICIAN')
  createMedication(@Body() body: any) {
    return this.administrationService.createMedication(body);
  }

  @Post('stock/suppliers')
  @Roles('SUPER_ADMIN', 'PHARMACIST')
  createSupplier(@Body() body: any) {
    return this.administrationService.createSupplier(body);
  }

  @Post('stock/lots')
  @Roles('SUPER_ADMIN', 'PHARMACIST', 'PHYSICIAN')
  createStockLot(@Body() body: any) {
    return this.administrationService.createStockLot(body);
  }

  @Get('reports')
  @Roles('SUPER_ADMIN', 'ADMIN')
  reports() {
    return this.administrationService.reports();
  }

  @Get('dashboard')
  @Roles('SUPER_ADMIN', 'ADMIN')
  dashboard() {
    return this.administrationService.dashboard();
  }

  /** Vue consolidée réservée à la direction de la plateforme. */
  @Get('executive-dashboard')
  @Roles('SUPER_ADMIN')
  executiveDashboard() {
    return this.administrationService.executiveDashboard();
  }
}
