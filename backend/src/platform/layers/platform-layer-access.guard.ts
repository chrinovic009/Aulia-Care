import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuliaLayer } from '@prisma/client';
import { PlatformLayersService } from './platform-layers.service';

const routeLayer = (path: string): AuliaLayer | null => {
  const normalized = path.split('?')[0].replace(/^\/api/, '');
  if (normalized.startsWith('/auth') || normalized.startsWith('/platform/layers')) return null;
  if (normalized.startsWith('/wearables') || normalized.startsWith('/connected-care')) return AuliaLayer.CONNECTED;
  if (normalized.startsWith('/clinical-intelligence') || normalized.startsWith('/intelligence')) return AuliaLayer.AI;
  // AI capabilities are deliberately scoped more narrowly than the clinical
  // record routes they extend. Core keeps ordinary consultations and calling;
  // transcription, telehealth and automated follow-up never run in Core.
  if (
    /\/telehealth(?:-|\/)|\/teleconsultation(?:-|\/)|\/transcript(?:-|\/)|\/daily-checkins?(?:\/|$)|\/provenance(?:-|\/)/i.test(normalized)
  ) return AuliaLayer.AI;
  return AuliaLayer.CORE;
};

/**
 * Enforces the deployment configuration even for a forged HTTP request. UI
 * hiding is only ergonomic; this guard is the actual security boundary.
 */
@Injectable()
export class PlatformLayerAccessGuard implements CanActivate {
  constructor(private readonly layers: PlatformLayersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const request = context.switchToHttp().getRequest();
    const path = String(request.path || request.url || '');
    const clinicalMode = String(request.body?.encounterType || request.body?.consultationMode || '').toUpperCase();
    const requiresAiConsultationMode = /\/consultations(?:\/[^/]+)?$/i.test(path.split('?')[0])
      && ['TELEHEALTH', 'TELECONSULTATION'].includes(clinicalMode);
    const requiredLayer = requiresAiConsultationMode ? AuliaLayer.AI : routeLayer(path);
    if (!requiredLayer) return true;
    // Core is the permanent clinical/system-of-record foundation. Selecting IA
    // or Connected never removes admissions, care, billing or staff screens.
    if (requiredLayer === AuliaLayer.CORE) return true;
    const configuration = await this.layers.getSnapshot(true);
    // Fail closed for optional layers. An absent, unreadable or not-yet saved
    // deployment configuration is treated as Core-only by getSnapshot(), so a
    // forged request can never activate an add-on before DEV enables it.
    if (configuration.enabledLayers.includes(requiredLayer)) return true;
    throw new ForbiddenException(`La couche ${requiredLayer} n’est pas activée pour cet établissement.`);
  }
}
