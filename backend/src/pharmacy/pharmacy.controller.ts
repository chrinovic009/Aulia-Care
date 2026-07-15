import { Body, Controller, Get, Param, Post, UseGuards, Request, ParseIntPipe } from '@nestjs/common';
import { ParseUUIDPipe } from '@nestjs/common'; // Ajoutez cet import s'il n'est pas présent
import { PharmacyService } from './pharmacy.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('pharmacy')
export class PharmacyController {
  constructor(private readonly pharmacyService: PharmacyService) {}

  // 1. OBTENIR TOUT LE CATALOGUE / MÉDICAMENTS
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

  // 2. GESTION DES PRESCRIPTIONS
  @Get('prescriptions')
  @Roles('SUPER_ADMIN', 'ADMIN', 'PHARMACIST')
  findPrescriptions() {
    // Cette méthode englobe l'affichage des prescriptions à traiter
    return this.pharmacyService.findPrescriptions();
  }

  @Get('prescriptions/ready')
  @Roles('SUPER_ADMIN', 'ADMIN', 'PHARMACIST')
  findReadyPrescriptions() {
    return this.pharmacyService.findReadyPrescriptions();
  }

  // 3. HISTORIQUE & CRÉATIONS (MÉDICAMENTS, LOTS)
  @Get('history')
  @Roles('SUPER_ADMIN', 'ADMIN', 'PHARMACIST')
  getHistory() {
    return this.pharmacyService.getHistory();
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

  // 4. LES CRÉATIONS DE VENTES (EXTERNES OU COMPTOIR)
  @Post('sales')
  @Roles('SUPER_ADMIN', 'ADMIN', 'PHARMACIST')
  createSale(@Body() body: any, @Request() req: any) {
    // On priorise la méthode externe ou indépendante selon ce qui est défini dans ton service
    if (this.pharmacyService.createIndependentSale) {
      return this.pharmacyService.createIndependentSale(body, req.user?.userId);
    }
    return this.pharmacyService.externalSale(body, req.user?.userId);
  }

  // 5. ENREGISTRER LA DÉLIVRANCE D'UNE PRESCRIPTION


// ...

  @Post('prescriptions/:id/dispense')
  @Roles('SUPER_ADMIN', 'ADMIN', 'PHARMACIST')
  dispensePrescription(
    @Param('id', ParseUUIDPipe) id: string, // <-- Changé ici ! ParseUUIDPipe et type string
    @Body() body: any, 
    @Request() req: any
  ) {
    // req.user?.userId correspond bien au type attendu par votre PharmacyService (actorId: string)
    return this.pharmacyService.dispensePrescription(id, body, req.user?.userId);
  }

  // 6. OBTENIR UN ÉLÉMENT PAR SON ID (Toujours tout en bas !)
  @Get(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'NURSE', 'PHYSICIAN', 'CASHIER', 'PHARMACIST')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.pharmacyService.findOne(id);
  }
}