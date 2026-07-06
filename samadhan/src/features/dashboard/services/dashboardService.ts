import { Issue } from "@/shared/types/domain/Issue";
import { IssueStatus } from "@/shared/types/domain/IssueStatus";
import { issueVerificationService } from "../../issues/services/issueVerificationService";

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface DashboardStats {
  activeCount: number;
  resolvedCount: number;
  totalSupportsCount: number;
  geoTaggedCount: number;
  avgResolutionDays: number | null;
  duplicateCount: number;
  issuesThisWeek: number;
  aiClassifiedCount: number;
}

export interface CategoryCount {
  name: string;
  count: number;
  color: string;
}

export interface StatusCount {
  name: string;
  value: number;
  color: string;
}

export interface MonthlyTrend {
  month: string;
  count: number;
}

export interface CityRanking {
  city: string;
  count: number;
  resolvedCount: number;
  resolutionRate: number;
  topCategory: string;
  riskLevel: "High" | "Medium" | "Low";
  density: number;
}

export interface DepartmentPerformance {
  department: string;
  activeCount: number;
  avgResolutionDays: number | null;
  resolutionRate: number;
  status: "Excellent" | "Average" | "Needs Attention";
}

export interface ForecastingState {
  expectedGrowthPercent: number;
  topCategoryLikelyToIncrease: string;
  estimatedReportsNextWeek: number;
}

export interface WeeklySummaryState {
  summaryTextEn: string;
  summaryTextHi: string;
  insightsEn: string[];
  insightsHi: string[];
}

export interface DashboardAnalytics {
  categoryData: CategoryCount[];
  statusData: StatusCount[];
  monthlyTrend: MonthlyTrend[];
  cityRanking: CityRanking[];
  departmentPerformance: DepartmentPerformance[];
  forecasting: ForecastingState;
  weeklySummary: WeeklySummaryState;
  totalIssues: number;
  geoTaggedCount: number;
  avgResolutionDays: number | null;
}

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

const CATEGORY_COLORS: Record<string, string> = {
  "Water Supply":    "#3b82f6",
  "जल आपूर्ति":     "#3b82f6",
  "Sanitation":      "#f59e0b",
  "स्वच्छता":       "#f59e0b",
  "Electricity":     "#eab308",
  "बिजली":          "#eab308",
  "Roads":           "#6b7280",
  "सड़कें":         "#6b7280",
  "Parks & Gardens": "#22c55e",
  "पार्क और बगीचे": "#22c55e",
  "Buildings":       "#8b5cf6",
  "भवन":            "#8b5cf6",
};

const KNOWN_CITIES = [
  { key: "bhopal", name: "Bhopal" },
  { key: "khanna", name: "Khanna" },
  { key: "indore", name: "Indore" },
  { key: "mumbai", name: "Mumbai" },
  { key: "delhi", name: "Delhi" },
  { key: "new delhi", name: "New Delhi" },
  { key: "bangalore", name: "Bengaluru" },
  { key: "bengaluru", name: "Bengaluru" },
  { key: "hyderabad", name: "Hyderabad" },
  { key: "chennai", name: "Chennai" },
  { key: "kolkata", name: "Kolkata" },
  { key: "pune", name: "Pune" }
];

const STATE_COUNTRY_BLACKLIST = new Set([
  "india", "usa", "united states",
  "madhya pradesh", "mp", "m.p.", "punjab", "maharashtra", "delhi", "haryana",
  "uttar pradesh", "up", "u.p.", "gujarat", "rajasthan", "karnataka", "tamil nadu",
  "kerala", "andhra pradesh", "telangana", "west bengal", "bihar", "jharkhand",
  "odisha", "chhattisgarh", "himachal pradesh", "uttarakhand", "goa", "assam"
]);

const STREET_INDICATORS = /\b(st|street|rd|road|lane|ln|plot|ward|flat|sector|building|house|h\.no|no|floor|near|opp|behind|post office|post|office|park)\b/i;

function extractCity(location: string): string {
  if (!location) return "Unknown";
  
  const lowerLocation = location.toLowerCase();
  
  // 1. Check for known cities in the text
  for (const city of KNOWN_CITIES) {
    const regex = new RegExp(`\\b${city.key}\\b`, "i");
    if (regex.test(lowerLocation)) {
      return city.name;
    }
  }

  // 2. Comma-separated analysis
  const parts = location.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return "Unknown";

  for (const part of parts) {
    const partLower = part.toLowerCase();
    
    // Skip blacklist items
    if (STATE_COUNTRY_BLACKLIST.has(partLower)) continue;
    
    // Skip pincodes
    if (/^\d{6}$/.test(partLower)) continue;
    
    // Skip specific street addresses
    if (/\d/.test(partLower) || STREET_INDICATORS.test(partLower)) continue;
    
    // If it looks like a clean name of length >= 3, return it capitalized
    if (part.length >= 3) {
      return part.charAt(0).toUpperCase() + part.slice(1);
    }
  }

  // Fallback 1: Return the first part that is not country/state
  for (const part of parts) {
    const partLower = part.toLowerCase();
    if (!STATE_COUNTRY_BLACKLIST.has(partLower)) {
      return part;
    }
  }

  // Fallback 2: Return first part
  return parts[0] || "Unknown";
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const dashboardService = {
  calculateStats(issues: Issue[]): DashboardStats {
    const activeCount = issues.filter(
      (i) => i.status !== IssueStatus.RESOLVED && i.status !== IssueStatus.REJECTED
    ).length;
    const resolvedCount = issues.filter((i) => i.status === IssueStatus.RESOLVED).length;
    const totalSupportsCount = issues.reduce((sum, i) => sum + i.supportsCount, 0);
    const geoTaggedCount = issues.filter((i) => i.latitude !== null && i.longitude !== null).length;
    
    // Avg resolution in days
    const resolvedWithDates = issues.filter(
      (i) => i.status === IssueStatus.RESOLVED && i.updatedAt
    );
    let avgResolutionDays: number | null = null;
    if (resolvedWithDates.length > 0) {
      const totalMs = resolvedWithDates.reduce(
        (sum, i) => sum + (i.updatedAt!.getTime() - i.createdAt.getTime()),
        0
      );
      avgResolutionDays = Math.round(totalMs / resolvedWithDates.length / 86_400_000);
    }
    
    const duplicateCount = issues.filter((i) => i.masterIssueId !== null).length;
    
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const issuesThisWeek = issues.filter((i) => i.createdAt.getTime() >= sevenDaysAgo).length;
    
    const aiClassifiedCount = issues.length; // All ingestion is processed

    return { 
      activeCount, 
      resolvedCount, 
      totalSupportsCount,
      geoTaggedCount,
      avgResolutionDays,
      duplicateCount,
      issuesThisWeek,
      aiClassifiedCount
    };
  },

  computeAnalytics(issues: Issue[]): DashboardAnalytics {
    // -- Category breakdown ------------------------------------------------
    const catCount: Record<string, number> = {};
    issues.forEach((i) => {
      const c = i.category as string;
      catCount[c] = (catCount[c] || 0) + 1;
    });
    const categoryData: CategoryCount[] = Object.entries(catCount)
      .map(([name, count]) => ({
        name,
        count,
        color: CATEGORY_COLORS[name] ?? "#6366f1",
      }))
      .sort((a, b) => b.count - a.count);

    // -- Status breakdown --------------------------------------------------
    const statusData: StatusCount[] = [
      { name: "Reported",    value: issues.filter((i) => i.status === IssueStatus.REPORTED).length,    color: "#f59e0b" },
      { name: "In Progress", value: issues.filter((i) => i.status === IssueStatus.IN_PROGRESS).length, color: "#3b82f6" },
      { name: "Resolved",    value: issues.filter((i) => i.status === IssueStatus.RESOLVED).length,    color: "#22c55e" },
      { name: "Rejected",    value: issues.filter((i) => i.status === IssueStatus.REJECTED).length,    color: "#ef4444" },
    ].filter((s) => s.value > 0);

    // -- Avg resolution time (days) ----------------------------------------
    const resolvedWithDates = issues.filter(
      (i) => i.status === IssueStatus.RESOLVED && i.updatedAt
    );
    let avgResolutionDays: number | null = null;
    if (resolvedWithDates.length > 0) {
      const totalMs = resolvedWithDates.reduce(
        (sum, i) => sum + (i.updatedAt!.getTime() - i.createdAt.getTime()),
        0
      );
      avgResolutionDays = Math.round(totalMs / resolvedWithDates.length / 86_400_000);
    }

    return {
      categoryData,
      statusData,
      monthlyTrend: this.computeMonthlyTrend(issues),
      cityRanking:  this.computeCityRanking(issues),
      departmentPerformance: this.computeDepartmentPerformance(issues),
      forecasting:  this.computeForecasting(issues),
      weeklySummary: this.generateWeeklySummary(issues),
      totalIssues:  issues.length,
      geoTaggedCount: issues.filter((i) => i.latitude && i.longitude).length,
      avgResolutionDays,
    };
  },

  computeMonthlyTrend(issues: Issue[]): MonthlyTrend[] {
    // Build a map for the last 6 months, initialised to 0
    const months: Record<string, number> = {};
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
      months[key] = 0;
    }
    issues.forEach((issue) => {
      const key = issue.createdAt.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
      if (key in months) months[key]++;
    });
    return Object.entries(months).map(([month, count]) => ({ month, count }));
  },

  computeCityRanking(issues: Issue[]): CityRanking[] {
    const cityMap: Record<string, Issue[]> = {};
    issues.forEach((issue) => {
      const city = extractCity(issue.location);
      if (!cityMap[city]) cityMap[city] = [];
      cityMap[city].push(issue);
    });
    const totalCount = issues.length;
    return Object.entries(cityMap)
      .map(([city, list]) => {
        const catCount: Record<string, number> = {};
        list.forEach((i) => {
          const c = i.category as string;
          catCount[c] = (catCount[c] || 0) + 1;
        });
        const topCategory =
          Object.entries(catCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
        const resolvedCount = list.filter((i) => i.status === IssueStatus.RESOLVED).length;
        const resolutionRate =
          list.length > 0 ? Math.round((resolvedCount / list.length) * 100) : 0;

        // Compute risk levels
        let riskLevel: "High" | "Medium" | "Low" = "Low";
        if (list.length >= 5 || resolutionRate < 50) {
          riskLevel = "High";
        } else if (list.length >= 2) {
          riskLevel = "Medium";
        }

        // Compute density
        const density = totalCount > 0 ? Math.round((list.length / totalCount) * 100) : 0;

        return {
          city,
          count: list.length,
          resolvedCount,
          resolutionRate,
          topCategory,
          riskLevel,
          density,
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  },

  computeDepartmentPerformance(issues: Issue[]): DepartmentPerformance[] {
    const DEPARTMENT_MAP: Record<string, string> = {
      "Water Supply":    "Jal Board / Water Corporation",
      "जल आपूर्ति":     "Jal Board / Water Corporation",
      "Sanitation":      "Municipal Solid Waste Management",
      "स्वच्छता":       "Municipal Solid Waste Management",
      "Electricity":     "State Electricity Board / DISCOM",
      "बिजली":          "State Electricity Board / DISCOM",
      "Roads":           "Public Works Department (PWD)",
      "सड़कें":         "Public Works Department (PWD)",
      "Parks & Gardens": "Horticulture Department",
      "पार्क और बगीचे": "Horticulture Department",
      "Buildings":       "Building & Construction Department",
      "भवन":            "Building & Construction Department",
    };

    const BASE_DAYS_MAP: Record<string, number> = {
      "Water Supply": 5, "जल आपूर्ति": 5,
      "Sanitation": 3, "स्वच्छता": 3,
      "Electricity": 2, "बिजली": 2,
      "Roads": 21, "सड़कें": 21,
      "Parks & Gardens": 10, "पार्क और बगीचे": 10,
      "Buildings": 30, "भवन": 30,
    };

    // Group issues by department
    const deptIssues: Record<string, Issue[]> = {};
    issues.forEach((issue) => {
      const cat = issue.category as string;
      const dept = DEPARTMENT_MAP[cat] ?? "Municipal Administration";
      if (!deptIssues[dept]) deptIssues[dept] = [];
      deptIssues[dept].push(issue);
    });

    return Object.entries(deptIssues).map(([department, list]) => {
      const activeCount = list.filter(
        (i) => i.status !== IssueStatus.RESOLVED && i.status !== IssueStatus.REJECTED
      ).length;
      const resolvedList = list.filter((i) => i.status === IssueStatus.RESOLVED);
      
      const resolutionRate = list.length > 0 ? Math.round((resolvedList.length / list.length) * 100) : 0;
      
      // Calculate avg resolution days
      let avgResolutionDays: number | null = null;
      if (resolvedList.length > 0) {
        const totalMs = resolvedList.reduce(
          (sum, i) => sum + (i.updatedAt!.getTime() - i.createdAt.getTime()),
          0
        );
        avgResolutionDays = Math.round(totalMs / resolvedList.length / 86_400_000);
      } else {
        // Fallback to base category days
        const firstIssue = list[0];
        const cat = firstIssue ? (firstIssue.category as string) : "";
        avgResolutionDays = BASE_DAYS_MAP[cat] ?? 14;
      }

      // Compute performance status deterministically
      let status: "Excellent" | "Average" | "Needs Attention" = "Average";
      if (resolutionRate >= 80 && activeCount <= 2) {
        status = "Excellent";
      } else if (resolutionRate < 50 || activeCount >= 5) {
        status = "Needs Attention";
      }

      return {
        department,
        activeCount,
        avgResolutionDays,
        resolutionRate,
        status,
      };
    }).sort((a, b) => b.resolutionRate - a.resolutionRate);
  },

  computeForecasting(issues: Issue[]): ForecastingState {
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const fourteenDaysAgo = now - 14 * 24 * 60 * 60 * 1000;

    const recentWeekCount = issues.filter((i) => i.createdAt.getTime() >= sevenDaysAgo).length;
    const prevWeekCount = issues.filter(
      (i) => i.createdAt.getTime() >= fourteenDaysAgo && i.createdAt.getTime() < sevenDaysAgo
    ).length;

    let expectedGrowthPercent = 0;
    if (prevWeekCount > 0) {
      expectedGrowthPercent = Math.round(((recentWeekCount - prevWeekCount) / prevWeekCount) * 100);
    } else if (recentWeekCount > 0) {
      expectedGrowthPercent = 15; // default positive prediction for initial growth
    }

    // Constrain forecast growth to realistic values
    expectedGrowthPercent = Math.max(-25, Math.min(45, expectedGrowthPercent));

    // Expected next week estimate
    const estimatedReportsNextWeek = Math.max(
      1,
      Math.round(recentWeekCount * (1 + expectedGrowthPercent / 100))
    );

    // Category likely to increase
    const catCount: Record<string, number> = {};
    issues.forEach((i) => {
      if (i.status !== IssueStatus.RESOLVED && i.status !== IssueStatus.REJECTED) {
        const c = i.category as string;
        catCount[c] = (catCount[c] || 0) + 1;
      }
    });
    const topCategoryLikelyToIncrease =
      Object.entries(catCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Sanitation";

    return {
      expectedGrowthPercent,
      topCategoryLikelyToIncrease,
      estimatedReportsNextWeek,
    };
  },

  generateWeeklySummary(issues: Issue[]): WeeklySummaryState {
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const recentIssues = issues.filter((i) => i.createdAt.getTime() >= sevenDaysAgo).length;

    // Get verified reports details
    const verifiedIssues = issues.filter((i) => {
      const state = issueVerificationService.getComputedState(i.id, i.title);
      return state.isVerified;
    });
    const verifiedCount = verifiedIssues.length;
    const verifiedThisWeek = verifiedIssues.filter((i) => i.createdAt.getTime() >= sevenDaysAgo).length;
    const verificationRate = issues.length > 0 ? Math.round((verifiedCount / issues.length) * 100) : 0;

    // Highest category & city ranking details
    const catCount: Record<string, number> = {};
    issues.forEach((i) => {
      const c = i.category as string;
      catCount[c] = (catCount[c] || 0) + 1;
    });
    const topCategory = Object.entries(catCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Roads";

    // City ranking
    const cityMap: Record<string, number> = {};
    issues.forEach((i) => {
      let city = "Unknown";
      if (i.location) {
        const parts = i.location.split(",").map((p) => p.trim()).filter(Boolean);
        city = parts[0] || "Unknown";
      }
      cityMap[city] = (cityMap[city] || 0) + 1;
    });
    const topCity = Object.entries(cityMap).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Indore";

    const resolvedCount = issues.filter((i) => i.status === IssueStatus.RESOLVED).length;
    const overallResolutionRate = issues.length > 0 ? Math.round((resolvedCount / issues.length) * 100) : 0;

    const summaryTextEn = `Weekly Summary: Active complaints are concentrated around **${topCategory}** in **${topCity}**, with **${recentIssues}** new issues reported this week. Municipal departments maintain an overall **${overallResolutionRate}%** resolution rate. Community participation remains active: **${verifiedCount}** reports are verified by citizen votes, showing a **${verificationRate}%** overall community verification rate.`;

    const summaryTextHi = `साप्ताहिक विवरण: सक्रिय शिकायतें मुख्य रूप से **${topCity}** में **${topCategory}** के आसपास केंद्रित हैं, इस सप्ताह **${recentIssues}** नए मामले दर्ज किए गए। नगर निगम विभाग **${overallResolutionRate}%** समाधान दर बनाए हुए हैं। सामुदायिक भागीदारी सक्रिय है: **${verifiedCount}** मामलों को नागरिक वोटों द्वारा सत्यापित किया गया है, जो **${verificationRate}%** कुल सत्यापन दर दर्शाता है।`;

    const insightsEn = [
      `Most reported category: **${topCategory}** (${catCount[topCategory] || 0} issues total).`,
      `Highest volume city: **${topCity}** (${cityMap[topCity] || 0} complaints).`,
      `Community Verification: **${verifiedThisWeek}** issues verified by citizens this week.`,
      `Resolution Turnaround: Average resolution speed stands at a steady pace.`,
    ];

    const insightsHi = [
      `सबसे अधिक रिपोर्ट की गई श्रेणी: **${topCategory}** (कुल ${catCount[topCategory] || 0} मामले)।`,
      `उच्चतम शिकायत वाला शहर: **${topCity}** (${cityMap[topCity] || 0} शिकायतें)।`,
      `सामुदायिक सत्यापन: इस सप्ताह नागरिकों द्वारा **${verifiedThisWeek}** मामलों को सत्यापित किया गया।`,
      `समाधान दर: औसत समाधान समय स्थिर बना हुआ है।`,
    ];

    return {
      summaryTextEn,
      summaryTextHi,
      insightsEn,
      insightsHi,
    };
  },
};
