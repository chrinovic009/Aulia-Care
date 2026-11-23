import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AbsenceDto, ContractDto, ContractUpdateDto, DecisionDto, HrPolicyDto, JustificationDto, LeaveRequestDto, MonthDto, PayrollPaymentDto, ReplacementRequestDto, ReplacementResponseDto, SalaryChangeDto } from './hr.dto';
import { HrAttendanceService } from './hr-attendance.service';
import { HrContractsService } from './hr-contracts.service';
import { HrLeaveService } from './hr-leave.service';
import { HrPayrollService } from './hr-payroll.service';
import { HrPolicyService } from './hr-policy.service';

type Authed = { user?: { userId?: string } };
/** Every staff member has an HR space; patients and the platform DEV do not. */
const STAFF = [
  'SUPER_ADMIN', 'ADMIN', 'FINANCE', 'CASHIER', 'RECEPTIONIST', 'NURSE', 'PHYSICIAN', 'SURGEON', 'ANESTHESIOLOGIST', 'MIDWIFE',
  'PARAMEDIC', 'DISPATCHER', 'LAB_TECHNICIAN', 'LAB_MANAGER', 'RADIOLOGIST', 'PHARMACIST', 'MEDICAL_DIRECTOR',
] as const;
const READERS = ['FINANCE', 'ADMIN', 'SUPER_ADMIN'] as const;

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('hr')
export class HrController {
  constructor(
    private readonly leave: HrLeaveService,
    private readonly payroll: HrPayrollService,
    private readonly contracts: HrContractsService,
    private readonly attendance: HrAttendanceService,
    private readonly policy: HrPolicyService,
  ) {}

  // ------------------------------------------------------------- my HR space
  @Get('me') @Roles(...STAFF)
  me(@Request() req: Authed) { return this.leave.mySpace(req.user); }

  @Get('me/colleagues') @Roles(...STAFF)
  colleagues(@Request() req: Authed) { return this.leave.colleagues(req.user); }

  @Post('me/leaves') @Roles(...STAFF)
  requestLeave(@Body() body: LeaveRequestDto, @Request() req: Authed) { return this.leave.requestLeave(body, req.user); }

  @Post('me/leaves/:id/cancel') @Roles(...STAFF)
  cancelLeave(@Param('id', ParseUUIDPipe) id: string, @Request() req: Authed) { return this.leave.cancelLeave(id, req.user); }

  @Post('me/replacements') @Roles(...STAFF)
  requestReplacement(@Body() body: ReplacementRequestDto, @Request() req: Authed) { return this.leave.requestReplacement(body, req.user); }

  @Post('me/replacements/:id/respond') @Roles(...STAFF)
  respond(@Param('id', ParseUUIDPipe) id: string, @Body() body: ReplacementResponseDto, @Request() req: Authed) { return this.leave.respondReplacement(id, body, req.user); }

  @Post('me/replacements/:id/cancel') @Roles(...STAFF)
  cancelReplacement(@Param('id', ParseUUIDPipe) id: string, @Request() req: Authed) { return this.leave.cancelReplacement(id, req.user); }

  // ------------------------------------------------------------- rules
  @Get('policy') @Roles(...READERS)
  getPolicy(@Request() req: Authed) { return this.policy.get(req.user); }

  @Put('policy') @Roles('FINANCE', 'ADMIN')
  updatePolicy(@Body() body: HrPolicyDto, @Request() req: Authed) { return this.policy.update({ ...body }, req.user); }

  // ------------------------------------------------------------- contracts & salaries
  @Get('employees') @Roles(...READERS)
  employees(@Request() req: Authed) { return this.contracts.employees(req.user); }

  @Get('employees/:id/contracts') @Roles(...READERS)
  contractHistory(@Param('id', ParseUUIDPipe) id: string, @Request() req: Authed) { return this.contracts.history(id, req.user); }

  @Post('employees/:id/contracts') @Roles('FINANCE', 'ADMIN')
  createContract(@Param('id', ParseUUIDPipe) id: string, @Body() body: ContractDto, @Request() req: Authed) { return this.contracts.create(id, body, req.user); }

  @Post('employees/:id/salary') @Roles('FINANCE', 'ADMIN')
  changeSalary(@Param('id', ParseUUIDPipe) id: string, @Body() body: SalaryChangeDto, @Request() req: Authed) { return this.contracts.changeSalary(id, body, req.user); }

  @Patch('contracts/:id') @Roles('FINANCE', 'ADMIN')
  updateContract(@Param('id', ParseUUIDPipe) id: string, @Body() body: ContractUpdateDto, @Request() req: Authed) { return this.contracts.update(id, body, req.user); }

  // ------------------------------------------------------------- payroll
  @Get('payroll') @Roles(...READERS)
  payrollOfMonth(@Query('month') month: string, @Request() req: Authed) { return this.payroll.list(month, req.user); }

  @Get('payroll/overview') @Roles(...READERS)
  payrollOverview(@Request() req: Authed) { return this.payroll.overview(req.user); }

  @Post('payroll/generate') @Roles('FINANCE')
  generate(@Body() body: MonthDto, @Request() req: Authed) { return this.payroll.generate(body.month, req.user); }

  @Post('payroll/:id/recompute') @Roles('FINANCE')
  recompute(@Param('id', ParseUUIDPipe) id: string, @Request() req: Authed) { return this.payroll.recompute(id, req.user); }

  @Post('payroll/:id/pay') @Roles('FINANCE')
  pay(@Param('id', ParseUUIDPipe) id: string, @Body() body: PayrollPaymentDto, @Request() req: Authed) { return this.payroll.pay(id, body, req.user); }

  // ------------------------------------------------------------- leave & replacements
  @Get('leaves') @Roles(...READERS)
  leaves(@Query('status') status: string | undefined, @Request() req: Authed) { return this.leave.leaves(status || undefined, req.user); }

  @Post('leaves/:id/decide') @Roles('ADMIN')
  decideLeave(@Param('id', ParseUUIDPipe) id: string, @Body() body: DecisionDto, @Request() req: Authed) { return this.leave.decideLeave(id, body, req.user); }

  @Get('replacements') @Roles(...READERS)
  replacements(@Query('status') status: string | undefined, @Request() req: Authed) { return this.leave.replacements(status || undefined, req.user); }

  @Post('replacements/:id/decide') @Roles('ADMIN')
  decideReplacement(@Param('id', ParseUUIDPipe) id: string, @Body() body: DecisionDto, @Request() req: Authed) { return this.leave.decideReplacement(id, body, req.user); }

  // ------------------------------------------------------------- attendance
  @Get('attendance') @Roles(...READERS)
  attendanceReport(@Query('month') month: string, @Request() req: Authed) { return this.attendance.report(month, req.user); }

  @Post('attendance/absences') @Roles('ADMIN')
  recordAbsence(@Body() body: AbsenceDto, @Request() req: Authed) { return this.attendance.recordAbsence(body, req.user); }

  @Post('attendance/:id/justify') @Roles('ADMIN')
  justify(@Param('id', ParseUUIDPipe) id: string, @Body() body: JustificationDto, @Request() req: Authed) { return this.attendance.justify(id, body, req.user); }
}
