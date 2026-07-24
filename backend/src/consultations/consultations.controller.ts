import { Body, Controller, Delete, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { ConsultationsService } from './consultations.service';
import { CreateConsultationDto } from './dto/create-consultation.dto';
import { UpdateConsultationDto } from './dto/update-consultation.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('consultations')
export class ConsultationsController {
  constructor(private readonly consultationsService: ConsultationsService) {}

  @Get()
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'NURSE', 'PHYSICIAN', 'CASHIER')
  findAll() {
    return this.consultationsService.findAll();
  }

  @Get(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'NURSE', 'PHYSICIAN', 'CASHIER')
  findOne(@Param('id') id: string) {
    return this.consultationsService.findOne(id);
  }

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'NURSE', 'PHYSICIAN')
  create(@Body() dto: CreateConsultationDto) {
    return this.consultationsService.create(dto);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'NURSE', 'PHYSICIAN')
  update(@Param('id') id: string, @Body() dto: UpdateConsultationDto, @Request() req: any) {
    return this.consultationsService.update(id, dto, req.user?.userId);
  }

  @Post(':id/clinical-sections')
  @Roles('SUPER_ADMIN', 'PHYSICIAN')
  saveClinicalSections(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.consultationsService.saveClinicalSections(id, body, req.user?.userId);
  }

  @Post(':id/lab-requests')
  @Roles('SUPER_ADMIN', 'PHYSICIAN')
  createLabRequest(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.consultationsService.createLabRequest(id, body, req.user?.userId);
  }

  @Post(':id/prescriptions')
  @Roles('SUPER_ADMIN', 'PHYSICIAN')
  createPrescription(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.consultationsService.createPrescription(id, body, req.user?.userId);
  }

  @Patch(':id/prescriptions/:prescriptionId')
  @Roles('SUPER_ADMIN', 'PHYSICIAN')
  updatePrescription(
    @Param('id') id: string,
    @Param('prescriptionId') prescriptionId: string,
    @Body() body: any,
    @Request() req: any,
  ) {
    return this.consultationsService.updatePrescription(id, prescriptionId, body, req.user?.userId);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  remove(@Param('id') id: string) {
    return this.consultationsService.remove(id);
  }
}
