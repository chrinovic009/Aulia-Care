// backend/src/laboratory/laboratory.controller.ts
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';

import { LaboratoryService } from './laboratory.service';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

import { CreateLabSectionDto } from './dto/create-lab-section.dto';
import { CreateLabCategoryDto } from './dto/create-lab-category.dto';
import { CreateLabTestDto } from './dto/create-lab-test.dto';
import { CreateLabTestParameterDto } from './dto/create-lab-test-parameter.dto';
import { CreateLabSampleTypeDto } from './dto/create-lab-sample-type.dto';
import { CreateLabTestSampleRequirementDto } from './dto/create-lab-test-sample-requirement.dto';
import { CreateLabTestConsumableRequirementDto } from './dto/create-lab-test-consumable-requirement.dto';
import { CreateLabConsumableDto } from './dto/create-lab-consumable.dto';
import { CreateLabConsumableStockDto } from './dto/create-lab-consumable-stock.dto';
import { ConfigureClinicLabTestDto } from './dto/configure-clinic-lab-test.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('laboratory')
export class LaboratoryController {
  constructor(
    private readonly laboratoryService: LaboratoryService,
  ) {}

  /*
   * ============================================================
   * DEMANDES LABORATOIRE
   * ============================================================
   */

  @Get()
  @Roles(
    'SUPER_ADMIN',
    'ADMIN',
    'RECEPTIONIST',
    'NURSE',
    'PHYSICIAN',
    'LAB_TECHNICIAN',
    'LAB_MANAGER',
  )
  findAll(@Request() req: any) {
    return this.laboratoryService.findAll(
      req.user?.userId || req.user?.id,
    );
  }

  /*
   * ============================================================
   * CATALOGUE MÉDICAL DE LA CLINIQUE
   * ============================================================
   *
   * Le catalogue appartient à la clinique authentifiée.
   *
   * Sa consultation peut être autorisée aux rôles cliniques
   * concernés, mais ses définitions maîtres restent administrées
   * par le LAB_MANAGER de cet établissement.
   */

  @Get('catalogue')
  @Roles(
    'SUPER_ADMIN',
    'ADMIN',
    'LAB_MANAGER',
    'PHYSICIAN',
  )
  findCatalogue(@Request() req: any) {
    return this.laboratoryService.findCatalogue(req.user?.userId || req.user?.id);
  }

    /*
   * ============================================================
   * CONFIGURATION DES EXAMENS DE LA CLINIQUE
   * ============================================================
   *
   * Les examens sont désormais directement rattachés à la clinique.
   *
   * Chaque clinique décide ensuite quels examens elle active,
   * leur prix local et leur délai opérationnel.
   *
   * Le clinicId n'est jamais accepté depuis le client :
   * il est dérivé exclusivement de l'utilisateur authentifié.
   */

  @Get('clinic-tests')
  @Roles('LAB_MANAGER')
  getClinicLabTests(@Request() req: any) {
    return this.laboratoryService.getClinicLabTests(
      req.user?.userId || req.user?.id,
    );
  }

@Put('clinic-tests/:labTestId')
@Roles('LAB_MANAGER')
configureClinicLabTest(
  @Param('labTestId') labTestId: string,
  @Body() body: ConfigureClinicLabTestDto,
  @Request() req: any,
) {
  return this.laboratoryService.configureClinicLabTest(
    labTestId,
    body,
    req.user?.userId || req.user?.id,
  );
}

  /*
   * ============================================================
   * ACTIVITÉ
   * ============================================================
   */

  @Get('activity')
  @Roles(
    'SUPER_ADMIN',
    'ADMIN',
    'LAB_TECHNICIAN',
    'LAB_MANAGER',
  )
  activityOverview(@Request() req: any) {
    return this.laboratoryService.getActivityOverview(
      req.user?.userId || req.user?.id,
    );
  }

  /*
   * ============================================================
   * CONFIGURATION OPÉRATIONNELLE DE LA CLINIQUE
   * ============================================================
   *
   * Ces paramètres appartiennent désormais à une clinique.
   *
   * LAB_MANAGER administre uniquement la configuration
   * opérationnelle de son propre établissement.
   *
   * DEV n'est volontairement pas autorisé ici :
   * DEV est un rôle plateforme et ne possède pas de clinicId
   * opérationnel implicite.
   */

  @Get('settings')
  @Roles('LAB_MANAGER')
  settings(@Request() req: any) {
    return this.laboratoryService.getSettings(
      req.user?.userId || req.user?.id,
    );
  }

  @Post('settings')
  @Roles('DEV')
  updateSettings(
    @Body() body: any,
    @Request() req: any,
  ) {
    return this.laboratoryService.updateSettings(
      body,
      req.user?.userId || req.user?.id,
    );
  }

  @Post('direct-result-authorization')
  @Roles('DEV')
  setDirectResultAuthorization(
    @Body() body: any,
    @Request() req: any,
  ) {
    return this.laboratoryService.setDirectResultAuthorization(
      body,
      req.user?.userId || req.user?.id,
    );
  }

  /*
   * ============================================================
   * TABLEAU DE BORD
   * ============================================================
   */

  @Get('dashboard/overview')
  @Roles(
    'SUPER_ADMIN',
    'ADMIN',
    'LAB_TECHNICIAN',
    'LAB_MANAGER',
  )
  dashboardOverview(@Request() req: any) {
    return this.laboratoryService.getDashboardOverview(
      req.user?.userId || req.user?.id,
    );
  }

  @Get('dashboard/workflow')
  @Roles(
    'SUPER_ADMIN',
    'ADMIN',
    'LAB_TECHNICIAN',
    'LAB_MANAGER',
  )
  dashboardWorkflow(@Request() req: any) {
    return this.laboratoryService.getDashboardWorkflow(
      req.user?.userId || req.user?.id,
    );
  }

  @Get('dashboard/alerts')
  @Roles(
    'SUPER_ADMIN',
    'ADMIN',
    'LAB_TECHNICIAN',
    'LAB_MANAGER',
  )
  dashboardAlerts(@Request() req: any) {
    return this.laboratoryService.getDashboardAlerts(
      req.user?.userId || req.user?.id,
    );
  }

  /*
   * ============================================================
   * TECHNICIENS / AFFECTATIONS
   * ============================================================
   */

  @Get('technicians')
  @Roles(
    'SUPER_ADMIN',
    'ADMIN',
    'LAB_MANAGER',
  )
  technicians(@Request() req: any) {
    return this.laboratoryService.getTechnicians(req.user);
  }

  @Post('items/:itemId/assign')
  @Roles(
    'SUPER_ADMIN',
    'ADMIN',
    'LAB_MANAGER',
  )
  assignTechnician(
    @Param('itemId') itemId: string,
    @Body() body: any,
    @Request() req: any,
  ) {
    return this.laboratoryService.assignTechnician(
      itemId,
      body,
      req.user,
    );
  }

  @Post('items/:itemId/reassign')
  @Roles(
    'SUPER_ADMIN',
    'ADMIN',
    'LAB_MANAGER',
  )
  reassignTechnician(
    @Param('itemId') itemId: string,
    @Body() body: any,
    @Request() req: any,
  ) {
    return this.laboratoryService.reassignTechnician(
      itemId,
      body,
      req.user,
    );
  }

  /*
   * ============================================================
   * VALIDATIONS
   * ============================================================
   */

  @Get('validations')
  @Roles(
    'SUPER_ADMIN',
    'ADMIN',
    'LAB_TECHNICIAN',
    'LAB_MANAGER',
  )
  validations(@Request() req: any) {
    return this.laboratoryService.getValidations(
      req.user?.userId || req.user?.id,
      req.user?.primaryRole,
    );
  }

  @Post('validations/:id/decision')
  @Roles(
    'SUPER_ADMIN',
    'ADMIN',
    'LAB_MANAGER',
  )
  decision(
    @Param('id') id: string,
    @Body() body: any,
    @Request() req: any,
  ) {
    return this.laboratoryService.applyValidationDecision(
      id,
      body,
      req.user?.userId || req.user?.id,
    );
  }

  /*
   * ============================================================
   * ALERTES CRITIQUES
   * ============================================================
   */

  @Get('critical-alerts')
  @Roles(
    'SUPER_ADMIN',
    'ADMIN',
    'LAB_MANAGER',
    'PHYSICIAN',
  )
  criticalAlerts(@Request() req: any) {
    return this.laboratoryService.getCriticalAlerts(
      req.user,
    );
  }

  @Post('critical-alerts/:id/acknowledge')
  @Roles(
    'SUPER_ADMIN',
    'ADMIN',
    'LAB_MANAGER',
    'PHYSICIAN',
  )
  acknowledgeCriticalAlert(
    @Param('id') id: string,
    @Body() body: { note?: string },
    @Request() req: any,
  ) {
    return this.laboratoryService.acknowledgeCriticalAlert(
      id,
      req.user,
      body?.note,
    );
  }

  /*
   * ============================================================
   * MUTATIONS DU CATALOGUE DE LA CLINIQUE
   * ============================================================
   *
   * IMPORTANT :
   *
   * LabSection
   * LabCategory
   * LabTest
   * LabTestParameter
   * LabSampleType
   * LabConsumable
   * LabTestSampleRequirement
   * LabTestConsumableRequirement
   *
   * sont des références propres à chaque clinique.
   *
   * Chaque mutation est limitée au clinicId dérivé de l’utilisateur authentifié.
   */

  @Post('catalogue/sections')
  @Roles('DEV')
  createSection(@Body() body: CreateLabSectionDto, @Request() req: any) {
    return this.laboratoryService.createSection(body, req.user?.userId || req.user?.id);
  }

  @Post('catalogue/categories')
  @Roles('DEV')
  createCategory(@Body() body: CreateLabCategoryDto, @Request() req: any) {
    return this.laboratoryService.createCategory(body, req.user?.userId || req.user?.id);
  }

  @Post('catalogue/tests')
  @Roles('DEV')
  createTest(
    @Body() body: CreateLabTestDto,
    @Request() req: any,
  ) {
    return this.laboratoryService.createTest(
      body,
      req.user?.userId || req.user?.id,
    );
  }

  @Post('catalogue/test-parameters')
  @Roles('DEV')
  createTestParameter(@Body() body: CreateLabTestParameterDto, @Request() req: any) {
    return this.laboratoryService.createTestParameter(body, req.user?.userId || req.user?.id);
  }

  @Post('catalogue/sample-types')
  @Roles('DEV')
  createSampleType(@Body() body: CreateLabSampleTypeDto, @Request() req: any) {
    return this.laboratoryService.createSampleType(body, req.user?.userId || req.user?.id);
  }

  @Post('catalogue/sample-requirements')
  @Roles('DEV')
  createSampleRequirement(@Body() body: CreateLabTestSampleRequirementDto, @Request() req: any) {
    return this.laboratoryService.createSampleRequirement(body, req.user?.userId || req.user?.id);
  }

  @Post('catalogue/consumables')
  @Roles('DEV')
  createConsumable(@Body() body: CreateLabConsumableDto, @Request() req: any) {
    return this.laboratoryService.createConsumable(body, req.user?.userId || req.user?.id);
  }

  @Post('catalogue/consumable-requirements')
  @Roles('DEV')
  createConsumableRequirement(@Body() body: CreateLabTestConsumableRequirementDto, @Request() req: any) {
    return this.laboratoryService.createConsumableRequirement(body, req.user?.userId || req.user?.id);
  }

  /*
   * ============================================================
   * STOCK OPÉRATIONNEL DE LA CLINIQUE
   * ============================================================
   *
   * Le consommable et son stock appartiennent à la même clinique.
   *
   * LAB_MANAGER ne peut donc créer du stock que dans
   * l'établissement auquel son compte est rattaché.
   */

  @Post('catalogue/stock')
  @Roles('DEV')
  createConsumableStock(
    @Body() body: CreateLabConsumableStockDto,
    @Request() req: any,
  ) {
    return this.laboratoryService.createConsumableStock(
      body,
      req.user?.userId || req.user?.id,
    );
  }

 /*
 * Modification du stock propre à la clinique.
 *
 * L'identifiant de clinique n'est jamais accepté depuis le body.
 * Le service détermine la clinique à partir du LAB_MANAGER
 * authentifié et refuse tout stock appartenant à une autre clinique.
 */
@Patch('catalogue/stock/:id')
@Roles('DEV')
updateConsumableStock(
  @Param('id') id: string,
  @Body()
  body: {
    quantity?: string;
    minimumLevel?: string;
    criticalLevel?: string;
    location?: string;
  },
  @Request() req: any,
) {
  return this.laboratoryService.updateConsumableStock(
    id,
    body,
    req.user?.userId || req.user?.id,
  );
}

@Patch('catalogue/:kind/:id')
@Roles('DEV')
updateCatalogue(
  @Param('kind') kind: string,
  @Param('id') id: string,
  @Body() body: any,
  @Request() req: any,
) {
  const allowedKinds = [
    'sections',
    'categories',
    'tests',
    'sample-types',
    'consumables',
    'test-parameters',
    'sample-requirements',
    'consumable-requirements',
  ] as const;

  type CatalogueKind = (typeof allowedKinds)[number];

  if (!allowedKinds.includes(kind as CatalogueKind)) {
    throw new BadRequestException(
      `Type de catalogue non autorisé : ${kind}`,
    );
  }

  return this.laboratoryService.updateCatalogue(
    kind as CatalogueKind,
    id,
    body,
    req.user?.userId || req.user?.id,
  );
}

@Delete('catalogue/:kind/:id')
@Roles('DEV')
deleteCatalogue(
  @Param('kind') kind: string,
  @Param('id') id: string,
  @Request() req: any,
) {
  const allowedKinds = [
    'sections',
    'categories',
    'tests',
    'sample-types',
    'consumables',
    'test-parameters',
    'sample-requirements',
    'consumable-requirements',
  ] as const;

  type CatalogueKind = (typeof allowedKinds)[number];

  if (!allowedKinds.includes(kind as CatalogueKind)) {
    throw new BadRequestException(
      `Type de catalogue non autorisé : ${kind}`,
    );
  }

  return this.laboratoryService.deleteCatalogue(
    kind as CatalogueKind,
    id,
    req.user?.userId || req.user?.id,
  );
}

/*
 * ============================================================
 * AUTORISATION D'ENVOI DIRECT DES RÉSULTATS
 * ============================================================
 *
 * Cette configuration est propre à chaque clinique.
 *
 * LAB_MANAGER peut autoriser ou désactiver l'envoi direct
 * des résultats par les techniciens de laboratoire de son
 * propre établissement.
 *
 * Le clinicId n'est jamais accepté depuis le body :
 * il est déterminé côté serveur à partir de l'utilisateur
 * authentifié.
 */


  /*
   * ============================================================
   * CRÉATION DES RÉSULTATS
   * ============================================================
   */

  @Post('requests/:id/results')
  @Roles(
    'SUPER_ADMIN',
    'LAB_TECHNICIAN',
    'LAB_MANAGER',
  )
  addResult(
    @Param('id') id: string,
    @Body() body: any,
    @Request() req: any,
  ) {
    return this.laboratoryService.addResult(
      id,
      body,
      req.user?.userId || req.user?.id,
    );
  }

  /*
   * ============================================================
   * ROUTE PARAMÉTRIQUE
   * ============================================================
   *
   * IMPORTANT :
   * Elle doit rester après toutes les routes GET statiques afin
   * que "catalogue", "activity", "settings", etc. ne soient pas
   * interprétés comme des identifiants de demande laboratoire.
   */

  @Get(':id')
  @Roles(
    'SUPER_ADMIN',
    'ADMIN',
    'RECEPTIONIST',
    'NURSE',
    'PHYSICIAN',
    'LAB_TECHNICIAN',
    'LAB_MANAGER',
  )
  findOne(
    @Param('id') id: string,
    @Request() req: any,
  ) {
    return this.laboratoryService.findOne(
      id,
      req.user?.userId || req.user?.id,
    );
  }
}
