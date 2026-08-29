import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';

/**
 * Which roles each administrative role is allowed to act on.
 *
 * Without this an Academic Admin could create a Super Admin account and hand
 * themselves the whole platform — the account-management screen is otherwise
 * open to both admin roles. Administration of admins belongs to the Super
 * Admin alone (§2: "Complete platform administration").
 */
export const MANAGEABLE_ROLES: Record<string, Role[]> = {
  [Role.SUPER_ADMIN]: [
    Role.SUPER_ADMIN,
    Role.ACADEMIC_ADMIN,
    Role.TEACHER,
    Role.STUDENT,
    Role.PARENT,
    Role.CONTENT_MANAGER,
    Role.DEPT_OVERSIGHT,
  ],
  // Academic operations only: teaching staff and learners, never other
  // administrators and never the department's oversight account.
  [Role.ACADEMIC_ADMIN]: [Role.TEACHER, Role.STUDENT, Role.PARENT, Role.CONTENT_MANAGER],
};

export function canManageRole(actorRole: Role, targetRole: Role): boolean {
  return (MANAGEABLE_ROLES[actorRole] ?? []).includes(targetRole);
}

/** Throws unless the actor is allowed to create or modify an account of this role. */
export function assertCanManageRole(actorRole: Role, targetRole: Role): void {
  if (!canManageRole(actorRole, targetRole)) {
    throw new ForbiddenException(
      `Your role cannot manage ${targetRole.replace(/_/g, ' ').toLowerCase()} accounts.`,
    );
  }
}

/** The role options an actor may offer in the account-creation form. */
export function assignableRoles(actorRole: Role): Role[] {
  return MANAGEABLE_ROLES[actorRole] ?? [];
}
