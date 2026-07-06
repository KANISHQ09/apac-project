import { gamificationService } from "../../profile/services/gamificationService";

export interface VerificationRecord {
  issueId: string;
  confirmations: number;
  disagreements: number;
  userVote?: "confirm" | "disagree" | null;
}

export interface VerificationState {
  confirmations: number;
  disagreements: number;
  confidence: number;
  isVerified: boolean;
  userVote: "confirm" | "disagree" | null;
}

class IssueVerificationService {
  private STORAGE_KEY_PREFIX = "samadhan_issue_vote_";

  /**
   * Retrieves or initializes community verification data for an issue.
   */
  getVerificationDataSync(issueId: string, title?: string): VerificationRecord {
    if (typeof window === "undefined") {
      return { issueId, confirmations: 0, disagreements: 0, userVote: null };
    }

    const key = `${this.STORAGE_KEY_PREFIX}${issueId}`;
    const local = localStorage.getItem(key);
    if (local) {
      try {
        return JSON.parse(local);
      } catch {}
    }

    // Initialize realistic vote counts for the demo dataset
    let confirmations = 0;
    let disagreements = 0;

    const cleanTitle = (title || "").toLowerCase();

    if (cleanTitle.includes("pothole") || cleanTitle.includes("road") || cleanTitle.includes("सड़क")) {
      confirmations = 12;
      disagreements = 1;
    } else if (cleanTitle.includes("garbage") || cleanTitle.includes("trash") || cleanTitle.includes("कचरा") || cleanTitle.includes("clean")) {
      confirmations = 8;
      disagreements = 2;
    } else if (cleanTitle.includes("leak") || cleanTitle.includes("water") || cleanTitle.includes("पानी")) {
      confirmations = 5;
      disagreements = 0;
    } else if (cleanTitle.includes("wire") || cleanTitle.includes("electricity") || cleanTitle.includes("बिजली") || cleanTitle.includes("blackout")) {
      confirmations = 11;
      disagreements = 0;
    } else {
      // Fallback: deterministic baseline sum for all other issues so they look natural
      let sum = 0;
      for (let i = 0; i < issueId.length; i++) {
        sum += issueId.charCodeAt(i);
      }
      confirmations = sum % 13; // 0 to 12
      disagreements = sum % 3;  // 0 to 2
    }

    const record: VerificationRecord = {
      issueId,
      confirmations,
      disagreements,
      userVote: null,
    };

    localStorage.setItem(key, JSON.stringify(record));
    return record;
  }

  /**
   * Returns the unified computed verification state for an issue.
   */
  getComputedState(issueId: string, title?: string): VerificationState {
    const data = this.getVerificationDataSync(issueId, title);
    const confidence = this.calculateConfidence(data.confirmations, data.disagreements);
    const isVerified = this.isCommunityVerified(data.confirmations, data.disagreements);
    return {
      confirmations: data.confirmations,
      disagreements: data.disagreements,
      confidence,
      isVerified,
      userVote: data.userVote || null,
    };
  }

  /**
   * Casts a vote on an issue.
   */
  async voteOnIssue(
    issueId: string,
    vote: "confirm" | "disagree",
    title?: string
  ): Promise<VerificationRecord> {
    if (typeof window === "undefined") {
      return { issueId, confirmations: 0, disagreements: 0, userVote: null };
    }

    const current = this.getVerificationDataSync(issueId, title);

    // Prevent double voting
    if (current.userVote) {
      return current;
    }

    // Update counts
    if (vote === "confirm") {
      current.confirmations += 1;
    } else {
      current.disagreements += 1;
    }

    current.userVote = vote;

    const key = `${this.STORAGE_KEY_PREFIX}${issueId}`;
    localStorage.setItem(key, JSON.stringify(current));

    // Dispatch custom DOM event to sync all listeners reactively
    window.dispatchEvent(
      new CustomEvent("issue_verifications_changed", { detail: { issueId } })
    );
    gamificationService.dispatchGamificationUpdate();

    return current;
  }

  /**
   * Helper to calculate confidence metrics.
   */
  calculateConfidence(confirmations: number, disagreements: number): number {
    const total = confirmations + disagreements;
    if (total === 0) return 0;
    return Math.round((confirmations / total) * 100);
  }

  /**
   * Determines if the issue crosses the community verification threshold.
   */
  isCommunityVerified(confirmations: number, disagreements: number): boolean {
    const confidence = this.calculateConfidence(confirmations, disagreements);
    return confirmations >= 10 && confidence >= 80;
  }
}

export const issueVerificationService = new IssueVerificationService();
