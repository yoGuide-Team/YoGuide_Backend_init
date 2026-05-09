import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_METADATA = 'yoguide.requiredPermissions';

/// Declares the permissions a route requires. Used together with
/// `PermissionsGuard`. If multiple permissions are listed, the user must
/// hold ALL of them. Use `@RequireAnyPermission` for OR semantics.
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_METADATA, { mode: 'all', permissions });

export const RequireAnyPermission = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_METADATA, { mode: 'any', permissions });
