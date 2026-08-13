import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { hasPermission } from '../auth/authenticated-user';

@Injectable()
export class GuideRoleGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    const user = req.user;
    if (!user) {
      throw new ForbiddenException('Authenticated user missing on request.');
    }
    if (
      hasPermission(user, '*') ||
      user.roleKey === 'GUIDE' ||
      user.roleKey === 'guide' ||
      user.roleKey === 'ADMIN' ||
      user.roleKey === 'admin'
    ) {
      return true;
    }
    throw new ForbiddenException('Guide access required.');
  }
}
