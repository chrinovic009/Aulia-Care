import { Controller, Get, Param, Patch, Body, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { MessagesService } from './messages.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get('unread')
  @Roles(
    'SUPER_ADMIN',
    'ADMIN',
    'RECEPTIONIST',
    'NURSE',
    'PHYSICIAN',
    'LAB_TECHNICIAN',
    'RADIOLOGIST',
    'PHARMACIST',
    'CASHIER',
    'PATIENT',
  )
  findUnread(@Request() req: any) {
    return this.messagesService.findUnread(req.user.userId);
  }

  @Get('with/:contactId')
  @Roles(
    'SUPER_ADMIN',
    'ADMIN',
    'RECEPTIONIST',
    'NURSE',
    'PHYSICIAN',
    'LAB_TECHNICIAN',
    'RADIOLOGIST',
    'PHARMACIST',
    'CASHIER',
    'PATIENT',
  )
  findConversation(@Request() req: any, @Param('contactId') contactId: string) {
    return this.messagesService.findConversation(req.user.userId, contactId);
  }

  @Patch('read')
  @Roles(
    'SUPER_ADMIN',
    'ADMIN',
    'RECEPTIONIST',
    'NURSE',
    'PHYSICIAN',
    'LAB_TECHNICIAN',
    'RADIOLOGIST',
    'PHARMACIST',
    'CASHIER',
    'PATIENT',
  )
  markRead(@Request() req: any, @Body() body: { senderId: string; messageIds?: string[] }) {
    return this.messagesService.markRead(req.user.userId, body.senderId, body.messageIds);
  }
}
