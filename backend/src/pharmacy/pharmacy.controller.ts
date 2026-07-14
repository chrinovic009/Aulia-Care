import { Body, Controller, Get, Param, Post, UseGuards, Request } from '@nestjs/common';
import { PharmacyService } from './pharmacy.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('pharmacy')
export class PharmacyController {
  constructor(private readonly pharmacyService: PharmacyService) {}

  @Get()
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'NURSE', 'PHYSICIAN', 'CASHIER', 'PHARMACIST')
  findAll() {
    return this.pharmacyService.findAll();
  }

  @Get('available')
  @Roles('SUPER_ADMIN', 'PHYSICIAN', 'PHARMACIST')
  findAvailable() {
    return this.pharmacyService.findAvailable();
  }

  @Get('stock')
  @Roles('SUPER_ADMIN', 'PHARMACIST')
  stock() {
    return this.pharmacyService.stockCatalog();
  }

  @Get('prescriptions')
  @Roles('SUPER_ADMIN', 'PHARMACIST')
  prescriptions() {
    return this.pharmacyService.prescriptionsToDispense();
  }

  @Post('medications')
  @Roles('SUPER_ADMIN', 'PHARMACIST')
  createMedication(@Body() body: any) {
    return this.pharmacyService.createMedication(body);
  }

  @Post('lots')
  @Roles('SUPER_ADMIN', 'PHARMACIST')
  createStockLot(@Body() body: any) {
    return this.pharmacyService.createStockLot(body);
  }

  @Post('prescriptions/:id/dispense')
  @Roles('SUPER_ADMIN', 'PHARMACIST')
  dispensePrescription(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.pharmacyService.dispensePrescription(id, body, req.user?.userId);
  }

  @Post('sales')
  @Roles('SUPER_ADMIN', 'PHARMACIST')
  externalSale(@Body() body: any, @Request() req: any) {
    return this.pharmacyService.externalSale(body, req.user?.userId);
  }

  @Get(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'NURSE', 'PHYSICIAN', 'CASHIER', 'PHARMACIST')
  findOne(@Param('id') id: string) {
    return this.pharmacyService.findOne(id);
  }
}
