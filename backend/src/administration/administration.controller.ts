import { Body, Controller, Get, Post, UseGuards, Param } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AdministrationService } from './administration.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('administration')
export class AdministrationController {
  constructor(private readonly administrationService: AdministrationService) {}

  @Get('departments')
  @Roles('SUPER_ADMIN', 'ADMIN')
  departments() {
    return this.administrationService.departments();
  }

  @Get('service-units')
  @Roles('SUPER_ADMIN', 'ADMIN')
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

  @Get('stock')
  @Roles('SUPER_ADMIN', 'ADMIN', 'PHARMACIST', 'PHYSICIAN')
  stock() {
    return this.administrationService.stockCatalog();
  }

  @Post('stock/medications')
  @Roles('SUPER_ADMIN', 'PHYSICIAN')
  createMedication(@Body() body: any) {
    return this.administrationService.createMedication(body);
  }

  @Post('stock/suppliers')
  @Roles('SUPER_ADMIN', 'PHYSICIAN')
  createSupplier(@Body() body: any) {
    return this.administrationService.createSupplier(body);
  }

  @Post('stock/lots')
  @Roles('SUPER_ADMIN', 'PHYSICIAN')
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
}
