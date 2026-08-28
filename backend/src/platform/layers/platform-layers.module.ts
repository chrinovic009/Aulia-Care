import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../../auth/auth.module';
import { PlatformLayersController } from './platform-layers.controller';
import { PlatformLayerAccessGuard } from './platform-layer-access.guard';
import { PlatformLayersService } from './platform-layers.service';

@Global()
@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [PlatformLayersController],
  providers: [PlatformLayersService, PlatformLayerAccessGuard],
  exports: [PlatformLayersService, PlatformLayerAccessGuard],
})
export class PlatformLayersModule {}
