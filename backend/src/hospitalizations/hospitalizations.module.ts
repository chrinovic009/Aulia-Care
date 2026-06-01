import { Module } from '@nestjs/common';
import { HospitalizationsService } from './hospitalizations.service';
import { HospitalizationsController } from './hospitalizations.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, NotificationsModule],
  providers: [HospitalizationsService],
  controllers: [HospitalizationsController],
})
export class HospitalizationsModule {}
