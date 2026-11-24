import { Module } from '@nestjs/common';
import { MessagesModule } from '../messages/messages.module';
import { PrismaModule } from '../prisma/prisma.module';
import { NavigationController } from './navigation.controller';
import { NavigationBadgesService } from './navigation-badges.service';

@Module({
  imports: [PrismaModule, MessagesModule],
  controllers: [NavigationController],
  providers: [NavigationBadgesService],
  exports: [NavigationBadgesService],
})
export class NavigationModule {}
