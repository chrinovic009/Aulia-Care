import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
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

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('laboratory')
export class LaboratoryController {
  constructor(
    private readonly laboratoryService: LaboratoryService,
  ) {}

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

  @Get('catalogue')
  @Roles(
    'SUPER_ADMIN',
    'ADMIN',
    'LAB_MANAGER',
    'PHYSICIAN',
  )
  findCatalogue() {
    return this.laboratoryService.findCatalogue();
  }

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

  /**
   * Politique fonctionnelle du laboratoire.
   *
   * DEV peut administrer cette configuration au niveau plateforme.
   * LAB_MANAGER peut consulter et gérer la politique opérationnelle
   * du laboratoire.
   *
   * IMPORTANT :
   * La configuration technicianDirectRelease est actuellement globale.
   * Elle devra être rattachée à clinicId lors du durcissement
   * multi-tenant du laboratoire.
   */
  @Get('settings')
  @Roles('DEV', 'LAB_MANAGER')
  settings() {
    return this.laboratoryService.getSettings();
  }

  @Post('settings')
  @Roles('DEV', 'LAB_MANAGER')
  updateSettings(@Body() body: any) {
    return this.laboratoryService.updateSettings(body);
  }

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
   * CATALOGUE LABORATOIRE
   * ============================================================
   *
   * Ces mutations restent DEV pour le moment.
   *
   * Ne pas simplement ajouter LAB_MANAGER ici tant que les modèles
   * catalogue/stock/configuration ne sont pas correctement isolés
   * par clinicId.
   */

  @Post('catalogue/sections')
  @Roles('DEV')
  createSection(
    @Body() body: CreateLabSectionDto,
  ) {
    return this.laboratoryService.createSection(body);
  }

  @Post('catalogue/categories')
  @Roles('DEV')
  createCategory(
    @Body() body: CreateLabCategoryDto,
  ) {
    return this.laboratoryService.createCategory(body);
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
  createTestParameter(
    @Body() body: CreateLabTestParameterDto,
  ) {
    return this.laboratoryService.createTestParameter(
      body,
    );
  }

  @Post('catalogue/sample-types')
  @Roles('DEV')
  createSampleType(
    @Body() body: CreateLabSampleTypeDto,
  ) {
    return this.laboratoryService.createSampleType(body);
  }

  @Post('catalogue/sample-requirements')
  @Roles('DEV')
  createSampleRequirement(
    @Body() body: CreateLabTestSampleRequirementDto,
  ) {
    return this.laboratoryService.createSampleRequirement(
      body,
    );
  }

  @Post('catalogue/consumables')
  @Roles('DEV')
  createConsumable(
    @Body() body: CreateLabConsumableDto,
  ) {
    return this.laboratoryService.createConsumable(body);
  }

  @Post('catalogue/consumable-requirements')
  @Roles('DEV')
  createConsumableRequirement(
    @Body() body: CreateLabTestConsumableRequirementDto,
  ) {
    return this.laboratoryService.createConsumableRequirement(
      body,
    );
  }

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

  @Patch('catalogue/:kind/:id')
  @Roles('DEV')
  updateCatalogue(
    @Param('kind') kind: string,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.laboratoryService.updateCatalogue(
      kind as any,
      id,
      body,
    );
  }

  @Delete('catalogue/:kind/:id')
  @Roles('DEV')
  deleteCatalogue(
    @Param('kind') kind: string,
    @Param('id') id: string,
  ) {
    return this.laboratoryService.deleteCatalogue(
      kind as any,
      id,
    );
  }

  /*
   * Cette route paramétrique doit rester après les routes
   * statiques comme /catalogue, /activity, /settings, etc.
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

  @Post('config/direct-result-authorization')
  @Roles('DEV')
  setDirectResultAuthorization(
    @Body() body: any,
    @Request() req: any,
  ) {
    return this.laboratoryService.setDirectResultAuthorization(
      Boolean(body?.enabled),
      req.user?.userId || req.user?.id,
    );
  }

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
}