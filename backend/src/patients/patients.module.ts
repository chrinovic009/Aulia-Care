import { Module } from '@nestjs/common';
import { PatientsService } from './patients.service';
import { PatientsController } from './patients.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, NotificationsModule],
  providers: [PatientsService],
  // Patient identity and admissions are never exposed on a public route.
  controllers: [PatientsController],
  exports: [PatientsService],
})
export class PatientsModule {}
