export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string | null;
  roleKey: string;
  roleLabel: string;
  /// Materialised permission set for this request. `*` means superuser.
  permissions: string[];
  emailVerified: boolean;
}

/// Returns true if the user's permission set satisfies the required
/// permission. `*` is a superuser shortcut. Wildcard suffixes ("places.*")
/// are not supported yet — keep permission strings flat.
export function hasPermission(user: AuthenticatedUser, required: string): boolean {
  if (user.permissions.includes('*')) return true;
  return user.permissions.includes(required);
}

export function hasAnyPermission(
  user: AuthenticatedUser,
  required: readonly string[],
): boolean {
  if (user.permissions.includes('*')) return true;
  return required.some((p) => user.permissions.includes(p));
}
