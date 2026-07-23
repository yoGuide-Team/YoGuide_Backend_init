import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Request } from 'express';
import type { AuthenticatedUser } from './authenticated-user';

/**
 * Gates specific actions (booking, wallet top-up) behind a verified email —
 * not registration or login themselves (see Phase 2 plan). Must run after
 * AuthGuard in the @UseGuards() list so req.user is already populated.
 */
@Injectable()
export class EmailVerifiedGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const user = req.user;
    if (!user) {
      // AuthGuard should have populated this. If it didn't, the route was
      // mis-decorated — fail closed.
      throw new ForbiddenException('Authenticated user missing on request.');
    }
    if (!user.emailVerified) {
      throw new ForbiddenException(
        'Please verify your email before continuing. POST /auth/send-otp to get a code.',
      );
    }
    return true;
  }
}
