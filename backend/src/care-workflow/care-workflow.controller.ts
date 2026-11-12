import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Request, UseFilters, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CareWorkflowService } from './care-workflow.service';
import {
  AssignTaskDto,
  CancelTransferDto,
  ChangeEpisodeStatusDto,
  ChangeServiceRequestStatusDto,
  ChangeTaskStatusDto,
  CorrectCareEventDto,
  CreateServiceRequestDto,
  DecideTransferDto,
  MergeProvisionalPatientDto,
  OpenEpisodeDto,
  RegisterArrivalDto,
  RecordCareEventDto,
  SendTransferDto,
  UpdateEpisodeDto,
  ValidateCareEventDto,
  VersionOnlyDto,
} from './dto/care-workflow.dto';
import { WorkflowRuleExceptionFilter } from './workflow-rule.filter';
import { AuditRead } from '../audit/audit-read.decorator';

type AuthedRequest = { user?: { userId?: string; id?: string; role?: string | null } };

/** Care staff only: access inside a unit is then decided by the person's unit assignment. */
const CARE_STAFF = [
  'NURSE', 'PHYSICIAN', 'SURGEON', 'ANESTHESIOLOGIST', 'MIDWIFE', 'PARAMEDIC', 'DISPATCHER',
  'RECEPTIONIST', 'LAB_TECHNICIAN', 'LAB_MANAGER', 'RADIOLOGIST', 'PHARMACIST',
] as const;

@UseGuards(JwtAuthGuard, RolesGuard)
@UseFilters(WorkflowRuleExceptionFilter)
@Roles(...CARE_STAFF)
@Controller('care-workflow')
export class CareWorkflowController {
  constructor(private readonly workflow: CareWorkflowService) {}

  @Get('my-units')
  myUnits(@Request() req: AuthedRequest) {
    return this.workflow.myUnits(req.user);
  }

  @Get('units')
  units(@Request() req: AuthedRequest) {
    return this.workflow.clinicUnits(req.user);
  }

  @Get('patients/search')
  searchPatients(@Query('q') q: string, @Request() req: AuthedRequest) {
    return this.workflow.searchPatients(q, req.user);
  }

  @Get('units/:unitId/history')
  history(@Param('unitId', ParseUUIDPipe) unitId: string, @Query('days') days: string | undefined, @Request() req: AuthedRequest) {
    return this.workflow.unitHistory(unitId, Number(days ?? 7), req.user);
  }

  @Post('units/:unitId/arrivals')
  arrival(@Param('unitId', ParseUUIDPipe) unitId: string, @Body() dto: RegisterArrivalDto, @Request() req: AuthedRequest) {
    return this.workflow.registerArrival(unitId, dto, req.user);
  }

  @Post('patients/:patientId/merge')
  merge(@Param('patientId', ParseUUIDPipe) patientId: string, @Body() dto: MergeProvisionalPatientDto, @Request() req: AuthedRequest) {
    return this.workflow.mergeProvisionalPatient(patientId, dto, req.user);
  }

  @Get('units/:unitId/worklist')
  worklist(@Param('unitId', ParseUUIDPipe) unitId: string, @Request() req: AuthedRequest) {
    return this.workflow.worklist(unitId, req.user);
  }

  @AuditRead('Patient', 'patientId')
  @Get('patients/:patientId/timeline')
  timeline(@Param('patientId', ParseUUIDPipe) patientId: string, @Request() req: AuthedRequest) {
    return this.workflow.patientTimeline(patientId, req.user);
  }

  // ------------------------------------------------------------------ episodes
  @Post('episodes')
  openEpisode(@Body() dto: OpenEpisodeDto, @Request() req: AuthedRequest) {
    return this.workflow.openEpisode(dto, req.user);
  }

  @AuditRead('CareEpisode')
  @Get('episodes/:id')
  episode(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthedRequest) {
    return this.workflow.episodeDetail(id, req.user);
  }

  @Patch('episodes/:id')
  updateEpisode(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateEpisodeDto, @Request() req: AuthedRequest) {
    return this.workflow.updateEpisode(id, dto, req.user);
  }

  @Post('episodes/:id/status')
  episodeStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ChangeEpisodeStatusDto, @Request() req: AuthedRequest) {
    return this.workflow.changeEpisodeStatus(id, dto, req.user);
  }

  // ------------------------------------------------------------------ requests
  @Post('requests')
  createRequest(@Body() dto: CreateServiceRequestDto, @Request() req: AuthedRequest) {
    return this.workflow.createRequest(dto, req.user);
  }

  @Post('requests/:id/status')
  requestStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ChangeServiceRequestStatusDto, @Request() req: AuthedRequest) {
    return this.workflow.changeRequestStatus(id, dto, req.user);
  }

  // ------------------------------------------------------------------ tasks
  @Post('tasks/:id/status')
  taskStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ChangeTaskStatusDto, @Request() req: AuthedRequest) {
    return this.workflow.changeTaskStatus(id, dto, req.user);
  }

  @Post('tasks/:id/assign')
  assignTask(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignTaskDto, @Request() req: AuthedRequest) {
    return this.workflow.assignTask(id, dto, req.user);
  }

  // ------------------------------------------------------------------ events
  @Post('events')
  recordEvent(@Body() dto: RecordCareEventDto, @Request() req: AuthedRequest) {
    return this.workflow.recordCareEvent(dto, req.user);
  }

  @Post('events/:id/correct')
  correctEvent(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CorrectCareEventDto, @Request() req: AuthedRequest) {
    return this.workflow.correctCareEvent(id, dto, req.user);
  }

  @Post('events/:id/validate')
  validateEvent(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ValidateCareEventDto, @Request() req: AuthedRequest) {
    return this.workflow.validateCareEvent(id, dto, req.user);
  }

  // ------------------------------------------------------------------ transfers
  @Post('transfers')
  sendTransfer(@Body() dto: SendTransferDto, @Request() req: AuthedRequest) {
    return this.workflow.sendTransfer(dto, req.user);
  }

  @Post('transfers/:id/acknowledge')
  acknowledge(@Param('id', ParseUUIDPipe) id: string, @Body() dto: VersionOnlyDto, @Request() req: AuthedRequest) {
    return this.workflow.acknowledgeTransfer(id, dto, req.user);
  }

  @Post('transfers/:id/decision')
  decide(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DecideTransferDto, @Request() req: AuthedRequest) {
    return this.workflow.decideTransfer(id, dto, req.user);
  }

  @Post('transfers/:id/cancel')
  cancel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelTransferDto, @Request() req: AuthedRequest) {
    return this.workflow.cancelTransfer(id, dto, req.user);
  }
}
