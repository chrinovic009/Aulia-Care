import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuliaLayer, RoleSlug } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type LayerActor = { userId?: string; role?: string | null; clinicId?: string | null };

export type PlatformLayersSnapshot = {
  configured: boolean;
  enabledLayers: AuliaLayer[];
  availableLayers: AuliaLayer[];
  configurationVersion: number;
  configuredAt: Date | null;
  updatedAt: Date | null;
};

type CachedSnapshot = { expiresAt: number; value: PlatformLayersSnapshot };

@Injectable()
export class PlatformLayersService {
  /** A separate cache entry per immutable Clinic.id prevents tenant leakage. */
  private readonly cache = new Map<string, CachedSnapshot>();

  constructor(private readonly prisma: PrismaService) {}

  private availableLayers(): AuliaLayer[] {
    const available: AuliaLayer[] = [AuliaLayer.CORE];
    if (process.env.AULIA_ENABLE_CLINICAL_AI !== 'false') available.push(AuliaLayer.AI);
    if (process.env.AULIA_ENABLE_CONNECTED_CARE !== 'false') available.push(AuliaLayer.CONNECTED);
    return available;
  }

  private fallback(): PlatformLayersSnapshot {
    return {
      configured: false,
      enabledLayers: [AuliaLayer.CORE],
      availableLayers: this.availableLayers(),
      configurationVersion: 0,
      configuredAt: null,
      updatedAt: null,
    };
  }

  /** Core is permanent; optional entitlements are enforced per clinic. */
  private effectiveLayers(layers: AuliaLayer[]): AuliaLayer[] {
    return layers.includes(AuliaLayer.CORE) ? layers : [AuliaLayer.CORE, ...layers];
  }

  private assertServerAvailability(layers: AuliaLayer[]) {
    const unavailable = layers.filter((layer) => !this.availableLayers().includes(layer));
    if (unavailable.length) {
      throw new BadRequestException(
        `Couche indisponible sur ce serveur : ${unavailable.join(', ')}. Vérifiez les variables AULIA_ENABLE_* puis redémarrez l’API.`,
      );
    }
  }

  invalidate(clinicId: string) {
    this.cache.delete(clinicId);
  }

  async getSnapshotForClinic(clinicId: string, force = false): Promise<PlatformLayersSnapshot> {
    if (!clinicId) throw new ForbiddenException('Établissement requis pour consulter les couches activées.');
    const cached = this.cache.get(clinicId);
    if (!force && cached && cached.expiresAt > Date.now()) return cached.value;

    const configuration = await this.prisma.platformLayerConfiguration.findUnique({
      where: { clinicId },
      select: { enabledLayers: true, configuredAt: true, configurationVersion: true, updatedAt: true },
    });
    const value: PlatformLayersSnapshot = configuration
      ? {
          configured: Boolean(configuration.configuredAt),
          enabledLayers: this.effectiveLayers(configuration.enabledLayers),
          availableLayers: this.availableLayers(),
          configurationVersion: configuration.configurationVersion,
          configuredAt: configuration.configuredAt,
          updatedAt: configuration.updatedAt,
        }
      : this.fallback();
    this.cache.set(clinicId, { value, expiresAt: Date.now() + 15_000 });
    return value;
  }

  /** DEV has no clinical scope; it receives only the safe pre-provisioning view. */
  async getSnapshotForActor(actor?: LayerActor): Promise<PlatformLayersSnapshot> {
    if (actor?.role === RoleSlug.DEV && !actor.clinicId) return this.fallback();
    if (!actor?.clinicId) {
      throw new ForbiddenException('Utilisateur non rattaché à un établissement actif.');
    }
    return this.getSnapshotForClinic(actor.clinicId);
  }

  async configureForClinic(clinicId: string, layers: AuliaLayer[], actorId: string): Promise<PlatformLayersSnapshot> {
    if (!clinicId) throw new BadRequestException('Établissement requis avant la configuration des couches.');
    const unique = this.effectiveLayers([...new Set(layers)]);
    if (!unique.length) throw new BadRequestException('Sélectionnez au moins une couche.');
    this.assertServerAvailability(unique);

    const clinic = await this.prisma.clinic.findFirst({
      where: { id: clinicId, deletedAt: null },
      select: { id: true },
    });
    if (!clinic) throw new NotFoundException('Établissement introuvable ou archivé.');

    const before = await this.getSnapshotForClinic(clinicId, true);
    const saved = await this.prisma.platformLayerConfiguration.upsert({
      where: { clinicId },
      create: {
        clinicId,
        enabledLayers: unique,
        configuredAt: new Date(),
        configurationVersion: 1,
        updatedById: actorId,
      },
      update: {
        enabledLayers: unique,
        configuredAt: new Date(),
        configurationVersion: { increment: 1 },
        updatedById: actorId,
      },
      select: { id: true, enabledLayers: true, configuredAt: true, configurationVersion: true, updatedAt: true },
    });
    await this.prisma.auditTrail.create({
      data: {
        actorId,
        entity: 'PlatformLayerConfiguration',
        entityId: saved.id,
        action: 'UPDATE',
        before: { clinicId, enabledLayers: before.enabledLayers, configured: before.configured, version: before.configurationVersion },
        after: { clinicId, event: 'LAYERS_CONFIGURED', enabledLayers: saved.enabledLayers, configurationVersion: saved.configurationVersion },
      },
    });

    const snapshot: PlatformLayersSnapshot = {
      configured: true,
      enabledLayers: this.effectiveLayers(saved.enabledLayers),
      availableLayers: this.availableLayers(),
      configurationVersion: saved.configurationVersion,
      configuredAt: saved.configuredAt,
      updatedAt: saved.updatedAt,
    };
    this.cache.set(clinicId, { value: snapshot, expiresAt: Date.now() + 15_000 });
    return snapshot;
  }
}
