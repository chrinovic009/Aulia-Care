import { BadRequestException, Injectable } from '@nestjs/common';
import { AuliaLayer } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type LayerActor = { userId: string; role?: string };

export type PlatformLayersSnapshot = {
  configured: boolean;
  enabledLayers: AuliaLayer[];
  availableLayers: AuliaLayer[];
  configurationVersion: number;
  configuredAt: Date | null;
  updatedAt: Date | null;
};

@Injectable()
export class PlatformLayersService {
  private cache: { expiresAt: number; value: PlatformLayersSnapshot } | null = null;

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

  /** Core is the system of record and is always effective for a user-facing
   * installation. AI and CONNECTED are optional capability extensions. */
  private effectiveLayers(layers: AuliaLayer[]): AuliaLayer[] {
    return layers.includes(AuliaLayer.CORE) ? layers : [AuliaLayer.CORE, ...layers];
  }

  async getSnapshot(force = false): Promise<PlatformLayersSnapshot> {
    if (!force && this.cache && this.cache.expiresAt > Date.now()) return this.cache.value;
    const configuration = await (this.prisma as any).platformLayerConfiguration.findUnique({
      where: { id: 'default' },
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
    this.cache = { value, expiresAt: Date.now() + 15_000 };
    return value;
  }

  async update(layers: AuliaLayer[], actor: LayerActor): Promise<PlatformLayersSnapshot> {
    if (actor.role !== 'DEV') {
      throw new BadRequestException('Seul le compte DEV peut modifier les couches de cette installation.');
    }
    const unique = this.effectiveLayers([...new Set(layers)]);
    if (!unique.length) throw new BadRequestException('Sélectionnez au moins une couche.');
    const unavailable = unique.filter((layer) => !this.availableLayers().includes(layer));
    if (unavailable.length) {
      throw new BadRequestException(`Couche indisponible sur ce serveur : ${unavailable.join(', ')}. Vérifiez les variables AULIA_ENABLE_* puis redémarrez l’API.`);
    }

    const before = await this.getSnapshot(true);
    const saved = await (this.prisma as any).platformLayerConfiguration.upsert({
      where: { id: 'default' },
      create: { id: 'default', enabledLayers: unique, configuredAt: new Date(), configurationVersion: 1, updatedById: actor.userId },
      update: { enabledLayers: unique, configuredAt: new Date(), configurationVersion: { increment: 1 }, updatedById: actor.userId },
      select: { enabledLayers: true, configuredAt: true, configurationVersion: true, updatedAt: true },
    });
    await this.prisma.auditTrail.create({
      data: {
        actorId: actor.userId,
        entity: 'PlatformLayerConfiguration',
        entityId: 'default',
        action: 'UPDATE',
        before: { enabledLayers: before.enabledLayers, configured: before.configured, version: before.configurationVersion },
        after: { enabledLayers: saved.enabledLayers, configurationVersion: saved.configurationVersion },
      },
    });
    const snapshot: PlatformLayersSnapshot = {
      configured: true,
      enabledLayers: saved.enabledLayers,
      availableLayers: this.availableLayers(),
      configurationVersion: saved.configurationVersion,
      configuredAt: saved.configuredAt,
      updatedAt: saved.updatedAt,
    };
    this.cache = { value: snapshot, expiresAt: Date.now() + 15_000 };
    return snapshot;
  }
}
