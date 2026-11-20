import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { PlatformLayersModule } from '../layers/platform-layers.module';
import { PlatformProvisioningController } from './platform-provisioning.controller';
import { PlatformProvisioningService } from './platform-provisioning.service';
import { PacsModule } from '../../pacs/pacs.module';

@Module({
  imports: [PrismaModule, PlatformLayersModule, PacsModule],
  controllers: [PlatformProvisioningController],
  providers: [PlatformProvisioningService],
})
export class PlatformProvisioningModule {}
