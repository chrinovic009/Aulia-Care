import { Module } from '@nestjs/common';
import { PatientsService } from './patients.service';
import { PatientsController } from './patients.controller';
import { PublicPatientsController } from './public-patients.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, NotificationsModule],
  providers: [PatientsService],
  controllers: [PatientsController, PublicPatientsController],
  exports: [PatientsService],
})
export class PatientsModule {}
