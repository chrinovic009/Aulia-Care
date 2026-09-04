import { ForbiddenException, Injectable } from '@nestjs/common';
import { RoleSlug } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuthenticatedActor {
  id?: string;
  userId?: string;
  sessionId?: string;
  role?: string | null;
  primaryRole?: string | null;
}

export interface OperationalClinicActor {
  id: string;
  clinicId: string;
  primaryRole: RoleSlug | null;
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

  /**
   * Resolves the actor from the database rather than trusting a tenant or role
   * value supplied by a browser token.  Clinical services should use this
   * method whenever they also need the actor's current primary role.
   */
  async requireOperationalActor(
    actor?: AuthenticatedActor,
  ): Promise<OperationalClinicActor> {
    const id = this.actorId(actor);
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        clinicId: true,
        primaryRole: true,
        status: true,
        deletedAt: true,
      },
    });

    if (!user || user.deletedAt || user.status !== 'ACTIVE' || !user.clinicId) {
      throw new ForbiddenException('Utilisateur non rattaché à un établissement actif.');
    }

    return {
      id: user.id,
      clinicId: user.clinicId,
      primaryRole: user.primaryRole,
    };
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
