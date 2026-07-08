import { Controller, Get, Param, UseGuards, Post, Request } from '@nestjs/common';
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
  
    @Get('prescriptions')
    @Roles('SUPER_ADMIN', 'ADMIN', 'PHARMACIST')
    findPrescriptions() {
      return this.pharmacyService.findPrescriptions();
    }

    @Get('prescriptions/ready')
    @Roles('SUPER_ADMIN', 'ADMIN', 'PHARMACIST')
    findReadyPrescriptions() {
      return this.pharmacyService.findReadyPrescriptions();
    }
  
    @Post('prescriptions/:id/dispense')
    @Roles('SUPER_ADMIN', 'ADMIN', 'PHARMACIST')
    dispensePrescription(@Param('id') id: string, @Request() req: any) {
      return this.pharmacyService.dispensePrescription(id, req.user?.userId);
    }

    @Post('sales')
    @Roles('SUPER_ADMIN', 'ADMIN', 'PHARMACIST')
    createIndependentSale(@Request() req: any) {
      return this.pharmacyService.createIndependentSale(req.body, req.user?.userId);
    }

  @Get('available')
  @Roles('SUPER_ADMIN', 'PHYSICIAN', 'PHARMACIST')
  findAvailable() {
    return this.pharmacyService.findAvailable();
  }

  @Get(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'NURSE', 'PHYSICIAN', 'CASHIER', 'PHARMACIST')
  findOne(@Param('id') id: string) {
    return this.pharmacyService.findOne(id);
  }
}
