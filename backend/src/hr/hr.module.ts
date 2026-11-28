import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { HrAccess } from './hr-access';
import { HrAttendanceService } from './hr-attendance.service';
import { HrContractsService } from './hr-contracts.service';
import { HrController } from './hr.controller';
import { HrLeaveService } from './hr-leave.service';
import { HrPayrollService } from './hr-payroll.service';
import { HrPolicyService } from './hr-policy.service';

/** Human resources: contracts and salaries, payroll, leave, replacements, attendance and lateness. */
@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [HrController],
  providers: [HrAccess, HrAttendanceService, HrContractsService, HrPayrollService, HrLeaveService, HrPolicyService],
})
export class HrModule {}
