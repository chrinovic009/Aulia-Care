import { CanActivate, ExecutionContext, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';

/** Server-to-server guard for Connected Care, never a browser-facing credential. */
@Injectable()
export class ConnectedCareIntegrationGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const configuredSecret = this.config.get<string>('CONNECTED_CARE_INGESTION_SECRET');
    if (!configuredSecret) {
      throw new ServiceUnavailableException('La passerelle Connected Care n’est pas configurée.');
    }
    const request = context.switchToHttp().getRequest();
    const provided = String(request.headers['x-aulia-integration-key'] || '');
    const expectedBuffer = Buffer.from(configuredSecret);
    const providedBuffer = Buffer.from(provided);
    if (expectedBuffer.length !== providedBuffer.length || !timingSafeEqual(expectedBuffer, providedBuffer)) {
      throw new UnauthorizedException('Passerelle Connected Care non authentifiée.');
    }
    return true;
  }
}
