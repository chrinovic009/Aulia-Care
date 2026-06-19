import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';

@Injectable()
export class LaboratoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  findAll() {
    return this.prisma.labRequest.findMany({
      where: { deletedAt: null },
      include: {
        patient: true,
        requestedBy: true,
        consultation: { include: { provider: true } },
        results: { include: { reportedBy: true }, orderBy: { reportedAt: 'desc' } },
      },
      orderBy: { requestedAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const request = await this.prisma.labRequest.findUnique({
      where: { id },
      include: {
        patient: true,
        requestedBy: true,
        consultation: { include: { provider: true } },
        results: { include: { reportedBy: true }, orderBy: { reportedAt: 'desc' } },
      },
    });
    if (!request) {
      throw new NotFoundException('Demande de laboratoire introuvable');
    }
    return request;
  }

  async addResult(id: string, dto: any, reportedById?: string) {
    const request = await this.findOne(id);
    const recipientId = request.requestedById || request.consultation?.providerId;
    const result = await this.prisma.$transaction(async (tx) => {
      const created = await tx.labResult.create({
        data: {
          labRequestId: id,
          resultCode: dto.resultCode || dto.resultName || 'RESULT',
          resultName: dto.resultName,
          resultValue: dto.resultValue,
          units: dto.units || null,
          referenceRange: dto.referenceRange || null,
          interpretation: dto.interpretation || null,
          reportedById,
          verified: Boolean(dto.verified),
          verifiedAt: dto.verified ? new Date() : null,
        },
      });

      await tx.labRequest.update({
        where: { id },
        data: {
          status: dto.verified ? 'VERIFIED' : 'COMPLETED',
          completedAt: new Date(),
          performedAt: new Date(),
        },
      });
      const notification = recipientId
        ? await tx.notification.create({
            data: {
              recipientId,
              patientId: request.patientId,
              type: 'ALERT',
              status: 'UNREAD',
              priority: dto.verified ? 'HIGH' : 'MEDIUM',
              title: 'Resultat laboratoire disponible',
              message: `Le resultat ${dto.resultName || request.specimenType || 'laboratoire'} de ${request.patient.firstName} ${request.patient.lastName} est disponible.`,
              relatedEntity: 'LabRequest',
              relatedId: request.id,
              sendAt: new Date(),
            },
          })
        : null;

      return { created, notification };
    });

    if (result.notification && recipientId) {
      this.notificationsGateway.notifyToUser(recipientId, 'notification.created', result.notification);
    }
    this.notificationsGateway.notify('lab.result.created', {
      labRequestId: id,
      patientId: request.patientId,
      result: result.created,
    });

    return result.created;
  }
}
