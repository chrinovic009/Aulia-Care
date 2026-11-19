import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ConnectedCareIntegrationController } from './connected-care-integration.controller';
import { ConnectedCareIntegrationGuard } from './connected-care-integration.guard';
import { CoreConnectedCareService } from './core-connected-care.service';
import { WearablesController } from './wearables.controller';
import { WearablesService } from './wearables.service';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [WearablesController, ConnectedCareIntegrationController],
  providers: [WearablesService, CoreConnectedCareService, ConnectedCareIntegrationGuard],
  exports: [WearablesService, CoreConnectedCareService],
})
export class WearablesModule {}
