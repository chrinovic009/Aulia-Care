import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { WearablesController } from './wearables.controller';
import { WearablesService } from './wearables.service';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [WearablesController],
  providers: [WearablesService],
  exports: [WearablesService],
})
export class WearablesModule {}
