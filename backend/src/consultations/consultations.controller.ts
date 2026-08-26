import { Body, Controller, Delete, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { ConsultationsService } from './consultations.service';
import { CreateConsultationDto } from './dto/create-consultation.dto';
import { OpenPatientConsultationDto } from './dto/open-patient-consultation.dto';
import { CreateImagingRequestDto } from './dto/create-imaging-request.dto';
import { ClinicalSectionsDto } from './dto/clinical-sections.dto';
import { CreateLabRequestDto } from './dto/create-lab-request.dto';
import { CreatePrescriptionDto } from './dto/create-prescription.dto';
import { UpdateConsultationDto } from './dto/update-consultation.dto';
import { SaveTelehealthTranscriptDto } from './dto/save-telehealth-transcript.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('consultations')
export class ConsultationsController {
  constructor(private readonly consultationsService: ConsultationsService) {}

  @Get()
  @Roles('SUPER_ADMIN', 'ADMIN', 'PHYSICIAN')
  findAll(@Request() req: any) {
    return this.consultationsService.findAll(req.user?.userId, req.user?.role);
  }

  /**
   * A draft is readable by physicians who legitimately follow the patient, but
   * only its author can resume editing it.  This route must precede `:id`.
   */
  @Get('drafts')
  @Roles('PHYSICIAN')
  findDrafts(@Request() req: any) {
    return this.consultationsService.findDraftsForPhysician(req.user?.userId);
  }

  @Get(':id/draft-detail')
  @Roles('PHYSICIAN')
  findDraftDetail(@Param('id') id: string, @Request() req: any) {
    return this.consultationsService.findDraftDetailForPhysician(id, req.user?.userId);
  }

  @Delete(':id/draft')
  @Roles('PHYSICIAN')
  archiveOwnDraft(@Param('id') id: string, @Request() req: any) {
    return this.consultationsService.archiveOwnDraft(id, req.user?.userId);
  }

  @Get(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'PHYSICIAN')
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.consultationsService.findOne(id, req.user?.userId, req.user?.role);
  }

  @Post()
  @Roles('PHYSICIAN')
  create(@Body() dto: CreateConsultationDto, @Request() req: any) {
    return this.consultationsService.create(dto, req.user?.userId);
  }

  @Post('open-for-patient')
  @Roles('PHYSICIAN')
  openForPatient(@Body() dto: OpenPatientConsultationDto, @Request() req: any) {
    return this.consultationsService.openForPatient(dto, req.user?.userId);
  }

  @Patch(':id')
  @Roles('PHYSICIAN')
  update(@Param('id') id: string, @Body() dto: UpdateConsultationDto, @Request() req: any) {
    return this.consultationsService.update(id, dto, req.user?.userId);
  }

  @Post(':id/clinical-sections')
  @Roles('PHYSICIAN')
  saveClinicalSections(@Param('id') id: string, @Body() body: ClinicalSectionsDto, @Request() req: any) {
    return this.consultationsService.saveClinicalSections(id, body, req.user?.userId);
  }

  @Post(':id/telehealth-transcript')
  @Roles('PHYSICIAN')
  saveTelehealthTranscript(@Param('id') id: string, @Body() body: SaveTelehealthTranscriptDto, @Request() req: any) {
    return this.consultationsService.saveTelehealthTranscript(id, body.sessionId, body.entries, req.user?.userId);
  }

  @Post(':id/lab-requests')
  @Roles('PHYSICIAN')
  createLabRequest(@Param('id') id: string, @Body() body: CreateLabRequestDto, @Request() req: any) {
    return this.consultationsService.createLabRequest(id, body, req.user?.userId);
  }

  @Post(':id/imaging-requests')
  @Roles('PHYSICIAN')
  createImagingRequest(@Param('id') id: string, @Body() body: CreateImagingRequestDto, @Request() req: any) {
    return this.consultationsService.createImagingRequest(id, body, req.user?.userId);
  }

  @Post(':id/prescriptions')
  @Roles('PHYSICIAN')
  createPrescription(@Param('id') id: string, @Body() body: CreatePrescriptionDto, @Request() req: any) {
    return this.consultationsService.createPrescription(id, body, req.user?.userId);
  }

  @Patch(':id/prescriptions/:prescriptionId')
  @Roles('PHYSICIAN')
  updatePrescription(
    @Param('id') id: string,
    @Param('prescriptionId') prescriptionId: string,
    @Body() body: CreatePrescriptionDto,
    @Request() req: any,
  ) {
    return this.consultationsService.updatePrescription(id, prescriptionId, body, req.user?.userId);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.consultationsService.remove(id, req.user?.userId);
  }
}
