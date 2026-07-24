import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Request } from 'express';
import type { AuthenticatedUser } from './authenticated-user';

/// Gates admin-approved-KYC-only actions (yoEcoPay / wallet top-up). Must
/// run after AuthGuard (@UseGuards(AuthGuard, IdentityVerifiedGuard)) —
/// reads req.user, doesn't populate it. Deliberately a separate guard from
/// PermissionsGuard: permissions are role-wide, identityStatus is
/// per-user and admin-mutated, so conflating the two into a synthetic
/// permission string would break the "permissions = what a role can do"
/// invariant the rest of RBAC relies on.
@Injectable()
export class IdentityVerifiedGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    if (req.user?.identityStatus !== 'approved') {
      throw new ForbiddenException(
        'IDENTITY_NOT_VERIFIED: This action requires admin-approved identity verification. Submit your documents via POST /me/identity-verification.',
      );
    }
    return true;
  }
}
