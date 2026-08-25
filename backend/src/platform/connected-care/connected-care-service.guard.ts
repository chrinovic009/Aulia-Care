import { CanActivate, ExecutionContext, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';

/** Protects an independently deployed Connected Care gateway from arbitrary uploads. */
@Injectable()
export class ConnectedCareServiceGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const secret = this.config.get<string>('CONNECTED_CARE_GATEWAY_SECRET');
    if (!secret) throw new ServiceUnavailableException('La passerelle Connected Care n’est pas configurée.');
    const provided = String(context.switchToHttp().getRequest().headers['x-aulia-gateway-key'] || '');
    const expected = Buffer.from(secret);
    const candidate = Buffer.from(provided);
    if (expected.length !== candidate.length || !timingSafeEqual(expected, candidate)) {
      throw new UnauthorizedException('Passerelle Connected Care non authentifiée.');
    }
    return true;
  }
}
