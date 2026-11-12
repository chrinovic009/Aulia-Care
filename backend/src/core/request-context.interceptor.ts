import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { runWithRequestContext } from './request-context';

type AuthedRequest = {
  method?: string;
  path?: string;
  route?: { path?: string };
  user?: { userId?: string; clinicId?: string | null; role?: string | null };
};

/** Runs every authenticated request handler inside its request context (after guards). */
@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const user = request.user;
    if (!user?.userId) return next.handle();
    const requestContext = {
      userId: user.userId,
      clinicId: user.clinicId ?? null,
      role: user.role ?? null,
      route: `${request.method ?? ''} ${request.route?.path ?? request.path ?? ''}`.trim(),
    };
    return new Observable((subscriber) =>
      runWithRequestContext(requestContext, () => next.handle().subscribe(subscriber)));
  }
}
