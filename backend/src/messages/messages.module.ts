import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { UsersModule } from '../users/users.module';
import { MessageMediaService } from './message-media.service';
import { PacsModule } from '../pacs/pacs.module';

@Module({
  imports: [PrismaModule, UsersModule, PacsModule],
  controllers: [MessagesController],
  providers: [MessagesService, MessageMediaService],
  exports: [MessagesService],
})
export class MessagesModule {}
