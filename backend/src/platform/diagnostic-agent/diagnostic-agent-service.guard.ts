import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';

/** Server-to-server authentication for the independently deployed Diagnostic Agent. */
@Injectable()
export class DiagnosticAgentServiceGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const secret = this.config.get<string>('DIAGNOSTIC_AGENT_SERVICE_SECRET');
    if (!secret) {
      throw new ServiceUnavailableException(
        'Le service Diagnostic Agent n’est pas configuré.',
      );
    }
    const provided = String(
      context.switchToHttp().getRequest().headers['x-aulia-diagnostic-agent-key'] || '',
    );
    const expected = Buffer.from(secret);
    const candidate = Buffer.from(provided);
    if (expected.length !== candidate.length || !timingSafeEqual(expected, candidate)) {
      throw new UnauthorizedException('Service Diagnostic Agent non authentifié.');
    }
    return true;
  }
}
