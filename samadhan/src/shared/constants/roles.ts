export const ROLES = {
  USER: "user",
  ADMIN: "admin",
  SUPER_ADMIN: "super_admin",
  DEPARTMENT_ADMIN: "department_admin",
} as const;

export type UserRoleType = typeof ROLES[keyof typeof ROLES];
