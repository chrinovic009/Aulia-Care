import { Body, Controller, Delete, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
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
  constructor(private readonly laboratoryService: LaboratoryService) {}

  @Get()
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'NURSE', 'PHYSICIAN', 'LAB_TECHNICIAN', 'LAB_MANAGER')
  findAll() {
    return this.laboratoryService.findAll();
  }

  @Get('catalogue')
  @Roles('SUPER_ADMIN', 'ADMIN', 'LAB_MANAGER', 'PHYSICIAN')
  findCatalogue() {
    return this.laboratoryService.findCatalogue();
  }

  @Get('activity')
  @Roles('SUPER_ADMIN', 'ADMIN', 'LAB_TECHNICIAN', 'LAB_MANAGER')
  activityOverview() {
    return this.laboratoryService.getActivityOverview();
  }

  @Get('settings')
  @Roles('SUPER_ADMIN', 'ADMIN', 'LAB_TECHNICIAN', 'LAB_MANAGER')
  settings() {
    return this.laboratoryService.getSettings();
  }

  @Post('settings')
  @Roles('SUPER_ADMIN', 'ADMIN', 'LAB_MANAGER')
  updateSettings(@Body() body: any) {
    return this.laboratoryService.updateSettings(body);
  }

  @Get('dashboard/overview')
  @Roles('SUPER_ADMIN', 'ADMIN', 'LAB_TECHNICIAN', 'LAB_MANAGER')
  dashboardOverview() {
    return this.laboratoryService.getDashboardOverview();
  }

  @Get('dashboard/workflow')
  @Roles('SUPER_ADMIN', 'ADMIN', 'LAB_TECHNICIAN', 'LAB_MANAGER')
  dashboardWorkflow() {
    return this.laboratoryService.getDashboardWorkflow();
  }

  @Get('dashboard/alerts')
  @Roles('SUPER_ADMIN', 'ADMIN', 'LAB_TECHNICIAN', 'LAB_MANAGER')
  dashboardAlerts() {
    return this.laboratoryService.getDashboardAlerts();
  }

  @Get('technicians')
  @Roles('SUPER_ADMIN', 'ADMIN', 'LAB_MANAGER')
  technicians(@Request() req: any) {
    return this.laboratoryService.getTechnicians(req.user);
  }

  @Post('items/:itemId/assign')
  @Roles('SUPER_ADMIN', 'ADMIN', 'LAB_MANAGER')
  assignTechnician(@Param('itemId') itemId: string, @Body() body: any, @Request() req: any) {
    return this.laboratoryService.assignTechnician(itemId, body, req.user);
  }

  @Post('items/:itemId/reassign')
  @Roles('SUPER_ADMIN', 'ADMIN', 'LAB_MANAGER')
  reassignTechnician(@Param('itemId') itemId: string, @Body() body: any, @Request() req: any) {
    return this.laboratoryService.reassignTechnician(itemId, body, req.user);
  }

  @Get('validations')
  @Roles('SUPER_ADMIN', 'ADMIN', 'LAB_TECHNICIAN', 'LAB_MANAGER')
  validations(@Request() req: any) {
    return this.laboratoryService.getValidations(req.user?.userId, req.user?.primaryRole);
  }

  @Post('validations/:id/decision')
  @Roles('SUPER_ADMIN', 'ADMIN', 'LAB_MANAGER')
  decision(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.laboratoryService.applyValidationDecision(id, body, req.user?.userId);
  }

  @Post('catalogue/sections')
  @Roles('SUPER_ADMIN', 'ADMIN', 'LAB_MANAGER')
  createSection(@Body() body: CreateLabSectionDto) {
    return this.laboratoryService.createSection(body);
  }

  @Post('catalogue/categories')
  @Roles('SUPER_ADMIN', 'ADMIN', 'LAB_MANAGER')
  createCategory(@Body() body: CreateLabCategoryDto) {
    return this.laboratoryService.createCategory(body);
  }

  @Post('catalogue/tests')
  @Roles('SUPER_ADMIN', 'ADMIN', 'LAB_MANAGER')
  createTest(@Body() body: CreateLabTestDto, @Request() req: any) {
    return this.laboratoryService.createTest(body, req.user?.userId);
  }

  @Post('catalogue/test-parameters')
  @Roles('SUPER_ADMIN', 'ADMIN', 'LAB_MANAGER')
  createTestParameter(@Body() body: CreateLabTestParameterDto) {
    return this.laboratoryService.createTestParameter(body);
  }

  @Post('catalogue/sample-types')
  @Roles('SUPER_ADMIN', 'ADMIN', 'LAB_MANAGER')
  createSampleType(@Body() body: CreateLabSampleTypeDto) {
    return this.laboratoryService.createSampleType(body);
  }

  @Post('catalogue/sample-requirements')
  @Roles('SUPER_ADMIN', 'ADMIN', 'LAB_MANAGER')
  createSampleRequirement(@Body() body: CreateLabTestSampleRequirementDto) {
    return this.laboratoryService.createSampleRequirement(body);
  }

  @Post('catalogue/consumables')
  @Roles('SUPER_ADMIN', 'ADMIN', 'LAB_MANAGER')
  createConsumable(@Body() body: CreateLabConsumableDto) {
    return this.laboratoryService.createConsumable(body);
  }

  @Post('catalogue/consumable-requirements')
  @Roles('SUPER_ADMIN', 'ADMIN', 'LAB_MANAGER')
  createConsumableRequirement(@Body() body: CreateLabTestConsumableRequirementDto) {
    return this.laboratoryService.createConsumableRequirement(body);
  }

  @Post('catalogue/stock')
  @Roles('SUPER_ADMIN', 'ADMIN', 'LAB_MANAGER')
  createConsumableStock(@Body() body: CreateLabConsumableStockDto, @Request() req: any) {
    return this.laboratoryService.createConsumableStock(body, req.user?.userId);
  }

  @Patch('catalogue/:kind/:id')
  @Roles('LAB_MANAGER')
  updateCatalogue(@Param('kind') kind: 'sections' | 'categories' | 'tests' | 'sample-types' | 'consumables', @Param('id') id: string, @Body() body: any) {
    return this.laboratoryService.updateCatalogue(kind, id, body);
  }

  @Delete('catalogue/:kind/:id')
  @Roles('LAB_MANAGER')
  deleteCatalogue(@Param('kind') kind: 'sections' | 'categories' | 'tests' | 'sample-types' | 'consumables', @Param('id') id: string) {
    return this.laboratoryService.deleteCatalogue(kind, id);
  }

  @Get(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'NURSE', 'PHYSICIAN', 'LAB_TECHNICIAN', 'LAB_MANAGER')
  findOne(@Param('id') id: string) {
    return this.laboratoryService.findOne(id);
  }

  @Post('config/direct-result-authorization')
  @Roles('SUPER_ADMIN', 'ADMIN', 'LAB_MANAGER')
  setDirectResultAuthorization(@Body() body: any, @Request() req: any) {
    return this.laboratoryService.setDirectResultAuthorization(Boolean(body?.enabled), req.user?.userId);
  }

  @Post('requests/:id/results')
  @Roles('SUPER_ADMIN', 'LAB_TECHNICIAN', 'LAB_MANAGER')
  addResult(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.laboratoryService.addResult(id, body, req.user?.userId);
  }
}
