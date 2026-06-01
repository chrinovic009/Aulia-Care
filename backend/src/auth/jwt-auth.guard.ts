import { ExecutionContext, Injectable, HttpStatus } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any, context: ExecutionContext, status?: any) {
    // If there's an error or no user, throw an error with proper HTTP status
    if (err || !user) {
      throw err || new Error(info?.message || 'Unauthorized');
    }
    return user;
  }
}
