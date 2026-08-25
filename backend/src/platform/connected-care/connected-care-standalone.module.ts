import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ConnectedCareServiceGuard } from './connected-care-service.guard';
import { ConnectedCareStandaloneController } from './connected-care-standalone.controller';
import { RemoteCoreDeviceGateway } from './remote-core-device.gateway';

/** A Connected Care process with no Prisma, Core module or Core UI import. */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot({ throttlers: [{ name: 'service', ttl: 60_000, limit: 240, blockDuration: 60_000 }] }),
  ],
  controllers: [ConnectedCareStandaloneController],
  providers: [ConnectedCareServiceGuard, RemoteCoreDeviceGateway, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class ConnectedCareStandaloneModule {}
