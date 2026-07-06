export const BUCKETS = {
  ISSUE_IMAGES: "issue-images",
} as const;

export type BucketType = typeof BUCKETS[keyof typeof BUCKETS];
