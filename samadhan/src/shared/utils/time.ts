/**
 * Calculates a localized human-readable time difference string.
 */
export function getTimeAgo(date: Date, language: "en" | "hi"): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (language === "en") {
    if (diffHours < 1) return "Just now";
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
    return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
  } else {
    if (diffHours < 1) return "अभी";
    if (diffHours < 24) return `${diffHours} घंटे पहले`;
    return `${diffDays} दिन पहले`;
  }
}
