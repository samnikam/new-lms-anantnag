import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from './decorators/current-user.decorator';

/**
 * Data-scope enforcement for the Academic Admin (§27).
 *
 * An Academic Admin runs academic operations for the site they are assigned to,
 * not for the whole division. Filtering in the UI is not enough — a hand-rolled
 * request would walk straight past it — so every scoped query narrows here, on
 * the server, from the role and site carried on the verified token.
 *
 * A null siteId means division-wide, which is a deliberate Super Admin choice
 * when creating the account rather than an accident: an admin assigned to no
 * site would otherwise be able to see nothing at all.
 */

/** Roles whose reach is limited to their assigned site. */
const SCOPED_ROLES: Role[] = [Role.ACADEMIC_ADMIN];

export function isScoped(user: AuthUser): boolean {
  return SCOPED_ROLES.includes(user.role) && !!user.siteId;
}

/** The site this user is confined to, or null when they are division-wide. */
export function scopeSiteId(user: AuthUser): string | null {
  return isScoped(user) ? user.siteId! : null;
}

/**
 * Narrows a caller-supplied site filter to what the user may actually see.
 * Asking for another site is refused rather than silently widened or ignored.
 */
export function resolveSiteFilter(user: AuthUser, requested?: string): string | undefined {
  const scope = scopeSiteId(user);
  if (!scope) return requested;

  if (requested && requested !== scope) {
    throw new ForbiddenException('You are not assigned to that site.');
  }
  return scope;
}

/** Throws when a record belongs to a site outside the user's scope. */
export function assertSiteAllowed(user: AuthUser, siteId?: string | null): void {
  const scope = scopeSiteId(user);
  if (!scope) return;
  if (siteId && siteId !== scope) {
    throw new ForbiddenException('That record belongs to a site you are not assigned to.');
  }
}

/** `where` fragment for models holding a direct siteId. */
export function siteWhere(user: AuthUser): { siteId?: string } {
  const scope = scopeSiteId(user);
  return scope ? { siteId: scope } : {};
}

/** `where` fragment for models reached through a classroom. */
export function classroomSiteWhere(user: AuthUser): { classroom?: { siteId: string } } {
  const scope = scopeSiteId(user);
  return scope ? { classroom: { siteId: scope } } : {};
}

/** `where` fragment for models reached through the owning student. */
export function studentSiteWhere(user: AuthUser): { student?: { siteId: string } } {
  const scope = scopeSiteId(user);
  return scope ? { student: { siteId: scope } } : {};
}
