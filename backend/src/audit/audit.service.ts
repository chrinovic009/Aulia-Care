import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  private async requireActorClinic(actorId?: string): Promise<string> {
    if (!actorId) throw new ForbiddenException('Utilisateur authentifié requis.');
    const actor = await this.prisma.user.findFirst({
      where: { id: actorId, status: 'ACTIVE', deletedAt: null },
      select: { clinicId: true },
    });
    if (!actor?.clinicId) {
      throw new ForbiddenException('Établissement actif requis pour consulter le journal d’audit.');
    }
    return actor.clinicId;
  }

  /**
   * AuditLog predates a direct clinicId. Until that legacy model can be
   * migrated, a log is visible only when every populated ownership relation
   * (actor and/or patient) belongs to the requesting clinic. A malformed log
   * with conflicting relations is deliberately invisible to both clinics.
   */
  private scopedWhere(clinicId: string): Prisma.AuditLogWhereInput {
    return {
      AND: [
        { OR: [{ actorId: null }, { actor: { clinicId } }] },
        { OR: [{ patientId: null }, { patient: { clinicId } }] },
        { OR: [{ actor: { clinicId } }, { patient: { clinicId } }] },
      ],
    };
  }

  async findAll(actorId?: string) {
    const clinicId = await this.requireActorClinic(actorId);
    return this.prisma.auditLog.findMany({
      where: this.scopedWhere(clinicId),
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, actorId?: string) {
    const clinicId = await this.requireActorClinic(actorId);
    const log = await this.prisma.auditLog.findFirst({
      where: { id, ...this.scopedWhere(clinicId) },
    });
    if (!log) {
      throw new NotFoundException("Journal d'audit introuvable");
    }
    return log;
  }
}
