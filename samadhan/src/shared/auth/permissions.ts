import { UserRole } from "@/shared/types/domain/UserRole";

export type Permission =
  | "view:admin_dashboard"
  | "manage:issues"
  | "manage:roles"
  | "view:security_logs"
  | "create:issues"
  | "support:issues";

export interface UserAuthContext {
  role: UserRole;
  department?: string | null;
}

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  [UserRole.USER]: ["create:issues", "support:issues"],
  [UserRole.DEPARTMENT_ADMIN]: ["view:admin_dashboard", "manage:issues"],
  [UserRole.ADMIN]: [
    "create:issues",
    "support:issues",
    "view:admin_dashboard",
    "manage:issues",
  ],
  [UserRole.SUPER_ADMIN]: [
    "create:issues",
    "support:issues",
    "view:admin_dashboard",
    "manage:issues",
    "manage:roles",
    "view:security_logs",
  ],
};

/**
 * Checks if the user's role grants the given permission.
 * Optionally validates if they have department-level access (e.g. Water, Roads, Sanitation).
 */
export function hasPermission(
  userContext: UserAuthContext | UserRole | string | null,
  permission: Permission,
  resourceDepartment?: string | null
): boolean {
  if (!userContext) return false;

  // Normalise string/enum input to UserAuthContext
  const ctx: UserAuthContext =
    typeof userContext === "string"
      ? { role: userContext as UserRole }
      : (userContext as UserAuthContext);

  const permissions = ROLE_PERMISSIONS[ctx.role];
  if (!permissions) return false;

  // 1. Basic permission check
  const hasBasePerm = permissions.includes(permission);
  if (!hasBasePerm) return false;

  // 2. Department-level verification
  if (ctx.role === UserRole.DEPARTMENT_ADMIN && resourceDepartment) {
    // A department admin can only manage/view resources belonging to their specific department
    // e.g. water department admin can only manage water issues.
    return ctx.department === resourceDepartment;
  }

  return true;
}
