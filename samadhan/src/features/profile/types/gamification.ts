export interface Achievement {
  id: string;
  title: string;
  description: string;
  unlocked: boolean;
  iconName: string;
  color: string;
  xpValue: number;
}

export interface GamificationState {
  xp: number;
  level: number;
  xpProgressPercent: number;
  currentLevelXp: number;
  nextLevelXp: number;
  impactScore: number;
  rank: string;
  reportedCount: number;
  supportedCount: number;
  verificationsCount: number;
  resolvedCount: number;
  streakCount: number;
  lastContributionDate: string | null;
  achievements: Achievement[];
}

export interface LeaderboardEntry {
  rank: number;
  name: string;
  impactScore: number;
  level: number;
  issuesCount: number;
  verificationsCount: number;
  isCurrentUser?: boolean;
}
