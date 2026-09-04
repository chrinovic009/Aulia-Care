import { Module } from '@nestjs/common';
import { PatientsService } from './patients.service';
import { PatientsController } from './patients.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ClinicContextService } from '../core/clinic-context.service';

@Module({
  imports: [PrismaModule, NotificationsModule],
  providers: [PatientsService, ClinicContextService],
  // Patient identity and admissions are never exposed on a public route.
  controllers: [PatientsController],
  exports: [PatientsService],
})
export class PatientsModule {}
