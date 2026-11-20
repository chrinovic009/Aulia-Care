import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Request,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AuditRead } from '../audit/audit-read.decorator';
import { MessagesService } from './messages.service';
import { MediaUpload, PHOTO_MAX_BYTES, VOICE_MAX_BYTES } from './message-media.service';

interface AuthenticatedRequest { user: { userId: string } }

const MESSAGE_ROLES = [
  'SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'NURSE', 'PHYSICIAN', 'LAB_MANAGER',
  'LAB_TECHNICIAN', 'RADIOLOGIST', 'PHARMACIST', 'CASHIER', 'FINANCE', 'PATIENT',
  'SURGEON', 'ANESTHESIOLOGIST', 'MIDWIFE', 'PARAMEDIC', 'DISPATCHER',
] as const;

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get('unread')
  @Roles(...MESSAGE_ROLES)
  findUnread(@Request() req: AuthenticatedRequest) {
    return this.messagesService.findUnread(req.user.userId);
  }

  @Get('with/:contactId')
  @Roles(...MESSAGE_ROLES)
  findConversation(@Request() req: AuthenticatedRequest, @Param('contactId') contactId: string) {
    return this.messagesService.findConversation(req.user.userId, contactId);
  }

  @Get('imaging/available/:contactId')
  @Roles('PHYSICIAN', 'RADIOLOGIST', 'SURGEON')
  findAvailableImaging(@Request() req: AuthenticatedRequest, @Param('contactId') contactId: string) {
    return this.messagesService.findAvailableImaging(req.user.userId, contactId);
  }

  @Post('media/:contactId')
  @Roles(...MESSAGE_ROLES)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: Math.max(PHOTO_MAX_BYTES, VOICE_MAX_BYTES), files: 1 } }))
  sendMedia(
    @Request() req: AuthenticatedRequest,
    @Param('contactId') contactId: string,
    @UploadedFile() file: MediaUpload | undefined,
    @Body() body: { kind?: string; caption?: string; durationMs?: string },
  ) {
    if (!file) throw new BadRequestException('Choisissez une photo ou enregistrez une note vocale.');
    return this.messagesService.createMediaMessage(
      req.user.userId,
      contactId,
      file,
      body.kind || '',
      body.caption || '',
      body.durationMs === undefined ? undefined : Number(body.durationMs),
    );
  }

  @Post('imaging/:contactId')
  @Roles('PHYSICIAN', 'RADIOLOGIST', 'SURGEON')
  sendImaging(
    @Request() req: AuthenticatedRequest,
    @Param('contactId') contactId: string,
    @Body() body: { imagingRequestId?: string; caption?: string; authorizePatient?: boolean },
  ) {
    return this.messagesService.createImagingMessage(
      req.user.userId,
      contactId,
      body.imagingRequestId || '',
      body.caption || '',
      body.authorizePatient === true,
    );
  }

  @Get(':messageId/attachment')
  @Roles(...MESSAGE_ROLES)
  @AuditRead('ChatMessage', 'messageId')
  async getAttachment(
    @Request() req: AuthenticatedRequest,
    @Param('messageId') messageId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const attachment = await this.messagesService.getAttachment(req.user.userId, messageId);
    response.setHeader('Content-Type', attachment.mimeType);
    response.setHeader('Content-Length', attachment.size);
    response.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(attachment.filename).replace(/"/g, '')}"`);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(attachment.stream);
  }

  @Patch('read')
  @Roles(...MESSAGE_ROLES)
  markRead(@Request() req: AuthenticatedRequest, @Body() body: { senderId: string; messageIds?: string[] }) {
    return this.messagesService.markRead(req.user.userId, body.senderId, body.messageIds);
  }
}
