export const STATUSES = {
  REPORTED: "reported",
  TRIAGE: "triage",
  ACCEPTED: "accepted",
  PLAN_REVIEW: "plan_review",
  PLAN_APPROVED: "plan_approved",
  ASSIGNED: "assigned",
  IN_PROGRESS: "in_progress",
  VERIFICATION: "verification",
  RESOLVED: "resolved",
  CLOSED: "closed",
  REJECTED: "rejected",
  NEEDS_MORE_INFO: "needs_more_info"
} as const;

export type StatusType = typeof STATUSES[keyof typeof STATUSES];

export const STATUS_LABELS = {
  [STATUSES.REPORTED]: { en: "Reported", hi: "रिपोर्ट की गई" },
  [STATUSES.TRIAGE]: { en: "Triage", hi: "वर्गीकरण" },
  [STATUSES.ACCEPTED]: { en: "Accepted", hi: "स्वीकृत" },
  [STATUSES.PLAN_REVIEW]: { en: "Plan Review", hi: "योजना समीक्षा" },
  [STATUSES.PLAN_APPROVED]: { en: "Plan Approved", hi: "योजना स्वीकृत" },
  [STATUSES.ASSIGNED]: { en: "Assigned", hi: "सौंपा गया" },
  [STATUSES.IN_PROGRESS]: { en: "In Progress", hi: "प्रगति में" },
  [STATUSES.VERIFICATION]: { en: "Verification", hi: "सत्यापन" },
  [STATUSES.RESOLVED]: { en: "Resolved", hi: "हल" },
  [STATUSES.CLOSED]: { en: "Closed", hi: "बंद" },
  [STATUSES.REJECTED]: { en: "Rejected", hi: "अस्वीकृत" },
  [STATUSES.NEEDS_MORE_INFO]: { en: "Needs Info", hi: "जानकारी आवश्यक" }
} as const;
