/**
 * Shared role checks for content-API controllers.
 *
 * `ctx.state.user` is the authenticated users-permissions user; its `role`
 * relation is populated by the JWT strategy. Staff roles (admin / OAS) are
 * allowed to bypass the tenant-scoping that restricts regular users.
 */

type AuthUser = { id?: number; role?: { type?: string; name?: string } } | null | undefined;

export function userRole(user: AuthUser): string | undefined {
  return user?.role?.type ?? user?.role?.name;
}

export function isAdmin(user: AuthUser): boolean {
  return userRole(user) === 'admin';
}

export function isOas(user: AuthUser): boolean {
  return userRole(user) === 'oas';
}

export function isStaff(user: AuthUser): boolean {
  return isAdmin(user) || isOas(user);
}
