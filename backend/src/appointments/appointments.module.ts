import { Module } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { AppointmentsController } from './appointments.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ClinicContextService } from '../core/clinic-context.service';

@Module({
  imports: [PrismaModule, NotificationsModule],
  providers: [AppointmentsService, ClinicContextService],
  controllers: [AppointmentsController],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
