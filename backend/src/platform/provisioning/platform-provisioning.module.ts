import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { PlatformLayersModule } from '../layers/platform-layers.module';
import { PlatformProvisioningController } from './platform-provisioning.controller';
import { PlatformProvisioningService } from './platform-provisioning.service';

@Module({
  imports: [PrismaModule, PlatformLayersModule],
  controllers: [PlatformProvisioningController],
  providers: [PlatformProvisioningService],
})
export class PlatformProvisioningModule {}
