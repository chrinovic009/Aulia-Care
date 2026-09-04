import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import { JwtService } from '@nestjs/jwt';

import { AuliaLayer, RoleSlug } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

import { PlatformLayersService } from './platform-layers.service';

const routeLayer = (path: string): AuliaLayer | null => {
  const normalized = path
    .split('?')[0]
    .replace(/^\/api/, '');

  if (
    normalized.startsWith('/auth') ||
    normalized.startsWith('/platform/layers') ||
    normalized.startsWith('/platform/provisioning')
  ) {
    return null;
  }

  if (
    normalized.startsWith('/wearables') ||
    normalized.startsWith('/connected-care')
  ) {
    return AuliaLayer.CONNECTED;
  }

  if (
    normalized.startsWith('/clinical-intelligence') ||
    normalized.startsWith('/intelligence')
  ) {
    return AuliaLayer.AI;
  }

  if (
    /\/telehealth(?:-|\/)|\/teleconsultation(?:-|\/)|\/transcript(?:-|\/)|\/daily-checkins?(?:\/|$)|\/provenance(?:-|\/)/i.test(
      normalized,
    )
  ) {
    return AuliaLayer.AI;
  }

  return AuliaLayer.CORE;
};

type GuardActor = {
  userId: string;
  role: RoleSlug | null;
  clinicId: string | null;
  status: string;
  deletedAt: Date | null;
};

/**
 * Enforces per-clinic entitlements before the request reaches an optional
 * module. This is an APP_GUARD, so it resolves the signed access token itself
 * before the controller's JwtAuthGuard populates request.user.
 */
@Injectable()
export class PlatformLayerAccessGuard implements CanActivate {
  constructor(
    private readonly layers: PlatformLayersService,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  private extractAccessToken(request: {
    headers?: Record<string, string | string[] | undefined>;
  }) {
    const cookie = String(request.headers?.cookie || '');

    const fromCookie = cookie
      .split(';')
      .map((part) => part.trim())
      .find((part) =>
        part.startsWith('aulia_access_token='),
      )
      ?.slice('aulia_access_token='.length);

    if (fromCookie) {
      return fromCookie;
    }

    const authorization = String(
      request.headers?.authorization || '',
    );

    return authorization.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length).trim()
      : null;
  }

  private async actorFromRequest(request: {
    headers?: Record<string, string | string[] | undefined>;
  }): Promise<GuardActor | null> {
    const token = this.extractAccessToken(request);

    if (!token) {
      return null;
    }

    try {
      const payload = this.jwt.verify<{
        sub?: string;
        type?: string;
      }>(token);

      if (
        !payload.sub ||
        payload.type === 'refresh'
      ) {
        return null;
      }

      const user =
        await this.prisma.user.findUnique({
          where: {
            id: payload.sub,
          },
          select: {
            id: true,
            primaryRole: true,
            clinicId: true,
            status: true,
            deletedAt: true,
          },
        });

      return user
        ? {
            userId: user.id,
            role: user.primaryRole,
            clinicId: user.clinicId,
            status: user.status,
            deletedAt: user.deletedAt,
          }
        : null;
    } catch {
      // JwtAuthGuard will return the authoritative 401
      // and verify the session.
      return null;
    }
  }

  async canActivate(
    context: ExecutionContext,
  ): Promise<boolean> {
    if (context.getType() !== 'http') {
      return true;
    }

    const request =
      context.switchToHttp().getRequest();

    const path = String(
      request.path ||
        request.url ||
        '',
    );

    const clinicalMode = String(
      request.body?.encounterType ||
        request.body?.consultationMode ||
        '',
    ).toUpperCase();

    const requiresAiConsultationMode =
      /\/consultations(?:\/[^/]+)?$/i.test(
        path.split('?')[0],
      ) &&
      [
        'TELEHEALTH',
        'TELECONSULTATION',
      ].includes(clinicalMode);

    const requiredLayer =
      requiresAiConsultationMode
        ? AuliaLayer.AI
        : routeLayer(path);

    if (!requiredLayer) {
      return true;
    }

    const actor =
      await this.actorFromRequest(request);

    if (!actor) {
      return true;
    }

    if (
      actor.deletedAt ||
      actor.status !== 'ACTIVE'
    ) {
      return true;
    }

    if (actor.role === RoleSlug.DEV) {
      throw new ForbiddenException(
        'Le compte DEV plateforme ne peut pas utiliser les données cliniques ou les modules d’établissement.',
      );
    }

    if (actor.role === RoleSlug.PATIENT) {
      const patientPortalPath =
        /^\/patients\/me(?:\/|$)/.test(
          path
            .split('?')[0]
            .replace(/^\/api/, ''),
        );

      if (!patientPortalPath) {
        throw new ForbiddenException(
          'Le compte patient ne peut accéder qu’à son portail personnel.',
        );
      }

      const patient =
        await this.prisma.patient.findFirst({
          where: {
            portalUserId: actor.userId,
            deletedAt: null,
          },
          select: {
            clinicId: true,
          },
        });

      /*
       * The patient service returns the authoritative 404
       * for an unlinked portal identity.
       *
       * No e-mail, phone or identity fallback is
       * performed here.
       */
      if (!patient) {
        return true;
      }

      /*
       * Tenant isolation is fail-closed.
       *
       * An explicitly linked portal patient must still
       * belong to a clinic before any clinical layer can
       * be accessed.
       */
      if (!patient.clinicId) {
        throw new ForbiddenException(
          'Le dossier patient n’est pas rattaché à un établissement configuré.',
        );
      }

      const configuration =
        await this.layers.getSnapshotForClinic(
          patient.clinicId,
          true,
        );

      if (
        configuration.configured &&
        configuration.enabledLayers.includes(
          requiredLayer,
        )
      ) {
        return true;
      }

      throw new ForbiddenException(
        `La couche ${requiredLayer} n’est pas activée pour votre établissement.`,
      );
    }

    if (!actor.clinicId) {
      throw new ForbiddenException(
        'Utilisateur non rattaché à un établissement actif.',
      );
    }

    const configuration =
      await this.layers.getSnapshotForClinic(
        actor.clinicId,
        true,
      );

    if (
      configuration.configured &&
      configuration.enabledLayers.includes(
        requiredLayer,
      )
    ) {
      return true;
    }

    throw new ForbiddenException(
      `La couche ${requiredLayer} n’est pas activée pour votre établissement.`,
    );
  }
}