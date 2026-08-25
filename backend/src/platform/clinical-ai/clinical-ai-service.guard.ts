import { CanActivate, ExecutionContext, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';

/** Server-to-server authentication for an independently deployed IA service. */
@Injectable()
export class ClinicalAIServiceGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const secret = this.config.get<string>('CLINICAL_AI_SERVICE_SECRET');
    if (!secret) throw new ServiceUnavailableException('Le service IA n’est pas configuré.');
    const provided = String(context.switchToHttp().getRequest().headers['x-aulia-ai-key'] || '');
    const expected = Buffer.from(secret);
    const candidate = Buffer.from(provided);
    if (expected.length !== candidate.length || !timingSafeEqual(expected, candidate)) {
      throw new UnauthorizedException('Service IA non authentifié.');
    }
    return true;
  }
}
