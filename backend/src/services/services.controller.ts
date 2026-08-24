import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ServicesService } from './services.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('services')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Get()
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'NURSE', 'PHYSICIAN', 'CASHIER', 'FINANCE', 'LAB_MANAGER', 'LAB_TECHNICIAN', 'RADIOLOGIST', 'PHARMACIST', 'PATIENT')
  findAll() {
    return this.servicesService.findAll();
  }

  @Get(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'NURSE', 'PHYSICIAN', 'CASHIER', 'FINANCE', 'LAB_MANAGER', 'LAB_TECHNICIAN', 'RADIOLOGIST', 'PHARMACIST', 'PATIENT')
  findOne(@Param('id') id: string) {
    return this.servicesService.findOne(id);
  }

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN')
  create(@Body() body: any) {
    return this.servicesService.create(body);
  }

  @Post('reception-administrative')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST')
  createReceptionAdministrativeUnit(@Body() body: { name?: string; description?: string }) {
    return this.servicesService.createReceptionAdministrativeUnit(body);
  }

  @Post('reception-admission-fees')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST')
  setReceptionAdmissionFee(@Body() body: { kind?: string; price?: number | string; description?: string }) {
    return this.servicesService.setReceptionAdmissionFee(body);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  update(@Param('id') id: string, @Body() body: any) {
    return this.servicesService.update(id, body);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  remove(@Param('id') id: string) {
    return this.servicesService.remove(id);
  }

  @Post(':id/prices')
  @Roles('SUPER_ADMIN', 'ADMIN')
  addPrice(@Param('id') id: string, @Body() body: any) {
    return this.servicesService.addTarif({ ...body, serviceId: id });
  }

  @Post(':id/responsables')
  @Roles('SUPER_ADMIN', 'ADMIN')
  addResponsables(@Param('id') id: string, @Body() body: any) {
    const items = Array.isArray(body) ? body : [body];
    return this.servicesService.addResponsables(items.map((it) => ({ ...it, serviceId: id })));
  }
  @Post(':id/staff')
  @Roles('SUPER_ADMIN', 'ADMIN')
  addStaff(
    @Param('id') id: string,
    @Body() body: any,
  ) {
    const items = Array.isArray(body)
      ? body
      : [body];

    return this.servicesService.addStaff(
      items.map((it) => ({
        ...it,
        serviceId: id,
      })),
    );
  }
}
