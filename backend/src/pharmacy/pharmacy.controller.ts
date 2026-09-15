import { Body, Controller, Get, Param, Post, UseGuards, Request, Query } from '@nestjs/common';
import { ParseUUIDPipe } from '@nestjs/common'; // Ajoutez cet import s'il n'est pas présent
import { PharmacyService } from './pharmacy.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AuthenticatedActor } from '../core/clinic-context.service';

interface AuthenticatedRequest {
  user?: AuthenticatedActor;
}

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

  @Get('catalogue')
  @Roles('SUPER_ADMIN', 'ADMIN', 'PHYSICIAN', 'PHARMACIST')
  catalogue(@Query('sectionId') sectionId?: string, @Query('categoryId') categoryId?: string, @Query('q') q?: string) {
    return this.pharmacyService.catalogue(sectionId, categoryId, q);
  }

  @Post('catalogue/sections')
  @Roles('SUPER_ADMIN', 'ADMIN', 'PHARMACIST')
  createSection(@Body() body: any) {
    return this.pharmacyService.createSection(body);
  }

  @Post('catalogue/categories')
  @Roles('SUPER_ADMIN', 'ADMIN', 'PHARMACIST')
  createCategory(@Body() body: any) {
    return this.pharmacyService.createCategory(body);
  }

  @Get('available')
  @Roles('SUPER_ADMIN', 'PHYSICIAN', 'PHARMACIST')
  findAvailable(@Request() req: AuthenticatedRequest) {
    return this.pharmacyService.findAvailable(req.user?.userId || req.user?.id);
  }

  @Get('stock')
  @Roles('SUPER_ADMIN', 'PHARMACIST')
  stock(@Request() req: AuthenticatedRequest) {
    return this.pharmacyService.stockCatalog(req.user?.userId || req.user?.id);
  }

  // 2. GESTION DES PRESCRIPTIONS
  @Get('prescriptions')
  @Roles('SUPER_ADMIN', 'ADMIN', 'PHARMACIST')
  findPrescriptions(@Request() req: AuthenticatedRequest) {
    // Cette méthode englobe l'affichage des prescriptions à traiter
    return this.pharmacyService.findPrescriptions(req.user?.userId || req.user?.id);
  }

  @Get('prescriptions/ready')
  @Roles('SUPER_ADMIN', 'ADMIN', 'PHARMACIST')
  findReadyPrescriptions(@Request() req: AuthenticatedRequest) {
    return this.pharmacyService.findReadyPrescriptions(req.user?.userId || req.user?.id);
  }

  // 3. HISTORIQUE & CRÉATIONS (MÉDICAMENTS, LOTS)
  @Get('history')
  @Roles('SUPER_ADMIN', 'ADMIN', 'PHARMACIST')
  getHistory(@Request() req: AuthenticatedRequest) {
    return this.pharmacyService.getHistory(req.user?.userId || req.user?.id);
  }

  @Post('medications')
  @Roles('SUPER_ADMIN', 'PHARMACIST')
  createMedication(@Body() body: any) {
    return this.pharmacyService.createMedication(body);
  }

  @Post('lots')
  @Roles('SUPER_ADMIN', 'PHARMACIST')
  createStockLot(@Body() body: any, @Request() req: AuthenticatedRequest) {
    return this.pharmacyService.createStockLot(body, req.user?.userId || req.user?.id);
  }

  // 4. LES CRÉATIONS DE VENTES (EXTERNES OU COMPTOIR)
  @Post('sales')
  @Roles('SUPER_ADMIN', 'ADMIN', 'PHARMACIST')
  createSale(@Body() body: any, @Request() req: AuthenticatedRequest) {
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
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: any,
    @Request() req: AuthenticatedRequest
  ) {
    return this.pharmacyService.dispensePrescription(id, body, req.user?.userId);
  }

  @Post('prescriptions/:id/cancel-dispense')
  @Roles('SUPER_ADMIN', 'ADMIN', 'PHARMACIST')
  cancelDispense(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthenticatedRequest) {
    return this.pharmacyService.cancelDispense(id, req.user?.userId);
  }

  // 6. OBTENIR UN ÉLÉMENT PAR SON ID (Toujours tout en bas !)
  @Get(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'NURSE', 'PHYSICIAN', 'CASHIER', 'PHARMACIST')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.pharmacyService.findOne(id);
  }
}
