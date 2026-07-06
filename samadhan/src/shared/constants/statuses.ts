export const STATUSES = {
  REPORTED: "reported",
  IN_PROGRESS: "in_progress",
  RESOLVED: "resolved",
  REJECTED: "rejected",
} as const;

export type StatusType = typeof STATUSES[keyof typeof STATUSES];

export const STATUS_LABELS = {
  [STATUSES.REPORTED]: { en: "Reported", hi: "रिपोर्ट की गई" },
  [STATUSES.IN_PROGRESS]: { en: "In Progress", hi: "प्रगति में" },
  [STATUSES.RESOLVED]: { en: "Resolved", hi: "हल" },
  [STATUSES.REJECTED]: { en: "Rejected", hi: "अस्वीकृत" },
} as const;
