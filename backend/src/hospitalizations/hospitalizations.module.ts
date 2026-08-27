import { Module } from '@nestjs/common';
import { HospitalizationsService } from './hospitalizations.service';
import { HospitalizationsController } from './hospitalizations.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ClinicContextService } from '../core/clinic-context.service';
import { NurseSchedulingService } from './nurse-scheduling.service';
import { BedAssignmentService } from './bed-assignment.service';

@Module({
  imports: [PrismaModule, NotificationsModule],
  providers: [HospitalizationsService, ClinicContextService, NurseSchedulingService, BedAssignmentService],
  controllers: [HospitalizationsController],
})
export class HospitalizationsModule {}
