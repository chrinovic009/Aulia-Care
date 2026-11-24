import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { OffDutyReadOnlyInterceptor, OffDutyService } from './off-duty.service';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [UsersService, OffDutyService, { provide: APP_INTERCEPTOR, useClass: OffDutyReadOnlyInterceptor }],
  controllers: [UsersController],
  exports: [UsersService, OffDutyService],
})
export class UsersModule {}
