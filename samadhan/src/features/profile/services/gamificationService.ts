import { Issue } from "@/shared/types/domain/Issue";
import { IssueStatus } from "@/shared/types/domain/IssueStatus";
import { GamificationState, Achievement, LeaderboardEntry } from "../types/gamification";

const countUserVotes = (): number => {
  if (typeof window === "undefined") return 0;
  let count = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith("samadhan_issue_vote_")) {
      const dataStr = localStorage.getItem(key);
      if (dataStr) {
        try {
          const data = JSON.parse(dataStr);
          if (data && data.userVote) {
            count++;
          }
        } catch {}
      }
    }
  }
  return count;
};

export const gamificationService = {
  computeProgress(issues: Issue[], supportedIssues: Issue[]): GamificationState {
    const reportedCount = issues.length;
    const supportedCount = supportedIssues.length;
    const verificationsCount = countUserVotes();
    const resolvedCount = issues.filter((i) => i.status === IssueStatus.RESOLVED).length;

    // Calculate XP
    const xp = (reportedCount * 100) + (supportedCount * 25) + (verificationsCount * 50) + (resolvedCount * 150);

    // Level progression
    const xpPerLevel = 300;
    const level = Math.floor(xp / xpPerLevel) + 1;
    const currentLevelXp = xp % xpPerLevel;
    const nextLevelXp = xpPerLevel;
    const xpProgressPercent = Math.round((currentLevelXp / nextLevelXp) * 100);

    // Impact Score
    const impactScore = (reportedCount * 10) + (supportedCount * 2) + (verificationsCount * 5) + (resolvedCount * 15);

    // Rank
    let rank = "Novice Citizen";
    if (impactScore >= 100) {
      rank = "City Champion";
    } else if (impactScore >= 60) {
      rank = "Civic Leader";
    } else if (impactScore >= 30) {
      rank = "Community Guardian";
    } else if (impactScore >= 10) {
      rank = "Active Resident";
    }

    // Streak
    const { streakCount, lastContributionDate } = this.calculateStreak(issues);

    // Achievements evaluation based on structured categories
    const achievements: Achievement[] = [
      {
        id: "first_report",
        title: "First Responder",
        description: "Reported your first civic issue",
        unlocked: reportedCount >= 1,
        iconName: "Flag",
        color: "text-orange-500 bg-orange-500/10 border-orange-500/20",
        xpValue: 100,
      },
      {
        id: "community_helper",
        title: "Community Helper",
        description: "Supported 3 civic issues reported by others",
        unlocked: supportedCount >= 3,
        iconName: "Heart",
        color: "text-rose-500 bg-rose-500/10 border-rose-500/20",
        xpValue: 50,
      },
      {
        id: "road_guardian",
        title: "Road Guardian",
        description: "Reported an issue in the Roads category",
        unlocked: issues.some((i) => i.category === "Roads" || i.category === "सड़कें"),
        iconName: "Construction",
        color: "text-amber-500 bg-amber-500/10 border-amber-500/20",
        xpValue: 100,
      },
      {
        id: "water_warrior",
        title: "Water Warrior",
        description: "Reported an issue in the Water Supply category",
        unlocked: issues.some((i) => i.category === "Water Supply" || i.category === "जल आपूर्ति"),
        iconName: "Droplets",
        color: "text-blue-500 bg-blue-500/10 border-blue-500/20",
        xpValue: 100,
      },
      {
        id: "clean_city",
        title: "Clean City Champion",
        description: "Reported an issue in the Sanitation category",
        unlocked: issues.some((i) => i.category === "Sanitation" || i.category === "स्वच्छता"),
        iconName: "Trash2",
        color: "text-green-500 bg-green-500/10 border-green-500/20",
        xpValue: 100,
      },
      {
        id: "community_verifier",
        title: "Community Verifier",
        description: "Cast 2 community verification votes",
        unlocked: verificationsCount >= 2,
        iconName: "CheckCircle2",
        color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
        xpValue: 100,
      },
      {
        id: "rising_citizen",
        title: "Rising Citizen",
        description: "Reached Community Level 2",
        unlocked: level >= 2,
        iconName: "TrendingUp",
        color: "text-indigo-500 bg-indigo-500/10 border-indigo-500/20",
        xpValue: 100,
      },
      {
        id: "community_hero",
        title: "Community Hero",
        description: "Earned an Impact Score of 50 or higher",
        unlocked: impactScore >= 50,
        iconName: "Shield",
        color: "text-yellow-500 bg-yellow-500/10 border-yellow-500/20",
        xpValue: 200,
      },
    ];

    return {
      xp,
      level,
      xpProgressPercent,
      currentLevelXp,
      nextLevelXp,
      impactScore,
      rank,
      reportedCount,
      supportedCount,
      verificationsCount,
      resolvedCount,
      streakCount,
      lastContributionDate,
      achievements,
    };
  },

  calculateStreak(issues: Issue[]): { streakCount: number; lastContributionDate: string | null } {
    if (issues.length === 0) {
      return { streakCount: 0, lastContributionDate: null };
    }

    const sorted = [...issues].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const lastContribution = sorted[0].createdAt;

    const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
    const nowMs = Date.now();
    const diffMs = nowMs - lastContribution.getTime();

    if (diffMs > 2 * oneWeekMs) {
      return { streakCount: 0, lastContributionDate: lastContribution.toLocaleDateString() };
    }

    let streakCount = 1;
    let currentWeekStart = lastContribution.getTime();
    
    for (let i = 1; i < sorted.length; i++) {
      const issueTime = sorted[i].createdAt.getTime();
      const timeDiff = currentWeekStart - issueTime;
      
      if (timeDiff >= oneWeekMs && timeDiff < 2 * oneWeekMs) {
        streakCount++;
        currentWeekStart = issueTime;
      } else if (timeDiff >= 2 * oneWeekMs) {
        break;
      }
    }

    return {
      streakCount,
      lastContributionDate: lastContribution.toLocaleDateString()
    };
  },

  getDemoLeaderboard(currentUserProgress: GamificationState, currentUserName: string): LeaderboardEntry[] {
    const list: LeaderboardEntry[] = [
      { rank: 1, name: "Rajesh Kumar", impactScore: 145, level: 5, issuesCount: 11, verificationsCount: 12 },
      { rank: 2, name: "Priya Sharma", impactScore: 98, level: 4, issuesCount: 8, verificationsCount: 7 },
      { rank: 3, name: "Amit Patel", impactScore: 62, level: 3, issuesCount: 5, verificationsCount: 4 },
      { rank: 4, name: "Sunita Devi", impactScore: 28, level: 2, issuesCount: 2, verificationsCount: 3 },
    ];

    const currentEntry: LeaderboardEntry = {
      rank: 5,
      name: currentUserName || "You (Citizen)",
      impactScore: currentUserProgress.impactScore,
      level: currentUserProgress.level,
      issuesCount: currentUserProgress.reportedCount,
      verificationsCount: currentUserProgress.verificationsCount,
      isCurrentUser: true,
    };

    const combined = [...list, currentEntry].sort((a, b) => b.impactScore - a.impactScore);

    return combined.map((entry, idx) => ({
      ...entry,
      rank: idx + 1
    }));
  },

  dispatchGamificationUpdate() {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("gamification_updated"));
    }
  }
};
