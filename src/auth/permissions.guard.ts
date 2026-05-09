import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { PERMISSIONS_METADATA } from './permissions.decorator';
import type { AuthenticatedUser } from './authenticated-user';
import { hasAnyPermission, hasPermission } from './authenticated-user';

interface PermissionsRule {
  mode: 'all' | 'any';
  permissions: string[];
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const rule = this.reflector.getAllAndOverride<PermissionsRule | undefined>(
      PERMISSIONS_METADATA,
      [context.getHandler(), context.getClass()],
    );
    if (!rule || rule.permissions.length === 0) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const user = req.user;
    if (!user) {
      // AuthGuard should have populated this. If it didn't, the route was
      // mis-decorated — fail closed.
      throw new ForbiddenException('Authenticated user missing on request.');
    }

    const allowed =
      rule.mode === 'all'
        ? rule.permissions.every((p) => hasPermission(user, p))
        : hasAnyPermission(user, rule.permissions);

    if (!allowed) {
      throw new ForbiddenException(
        `Requires permission${rule.permissions.length > 1 ? 's' : ''}: ${rule.permissions.join(rule.mode === 'all' ? ' AND ' : ' OR ')}`,
      );
    }
    return true;
  }
}
