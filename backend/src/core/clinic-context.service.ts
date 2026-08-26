import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface AuthenticatedActor {
  id?: string;
  userId?: string;
  sessionId?: string;
  role?: string | null;
}

/**
 * Minimal tenant boundary for Core services. It deliberately exposes only the
 * actor identity and clinic scope; business services still own their rules.
 */
@Injectable()
export class ClinicContextService {
  constructor(private readonly prisma: PrismaService) {}

  actorId(actor?: AuthenticatedActor): string {
    const actorId = actor?.userId || actor?.id;
    if (!actorId) throw new ForbiddenException('Utilisateur authentifié requis.');
    return actorId;
  }

  async requireActorClinic(actor?: AuthenticatedActor): Promise<string> {
    return this.requireUserClinic(this.actorId(actor));
  }

  async requireUserClinic(userId: string): Promise<string> {
    const actor = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { clinicId: true, status: true, deletedAt: true },
    });
    if (!actor || actor.deletedAt || actor.status !== 'ACTIVE' || !actor.clinicId) {
      throw new ForbiddenException('Utilisateur non rattaché à un établissement actif.');
    }
    return actor.clinicId;
  }

  async assertSameClinic(userId: string, clinicId: string): Promise<void> {
    const actorClinicId = await this.requireUserClinic(userId);
    if (actorClinicId !== clinicId) {
      throw new ForbiddenException('Accès refusé : établissement différent.');
    }
  }

  clinicWhere(clinicId: string) {
    return { clinicId } as const;
  }
}
