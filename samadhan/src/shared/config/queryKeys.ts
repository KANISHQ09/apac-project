export const queryKeys = {
  auth: {
    session: () => ["auth", "session"] as const,
    user: () => ["auth", "user"] as const,
  },
  issues: {
    list: () => ["issues", "list"] as const,
    detail: (id: string) => ["issues", "detail", id] as const,
    userList: (userId: string) => ["issues", "user", userId] as const,
    supports: (userId: string) => ["issues", "supports", userId] as const,
  },
  profile: {
    current: () => ["profile", "current"] as const,
    detail: (userId: string) => ["profile", "detail", userId] as const,
    preferences: (userId: string) => ["profile", "preferences", userId] as const,
  },
  schemes: {
    list: () => ["schemes", "list"] as const,
  },
  documents: {
    list: () => ["documents", "list"] as const,
  },
  admin: {
    issuesList: () => ["admin", "issues"] as const,
  },
} as const;
