/**
 * aiInsightService.ts
 * -------------------
 * Generates structured civic intelligence for an issue via two paths:
 *
 * PRIMARY:  Calls the existing `samadhan-chat` Supabase Edge Function
 *           (Gemini 2.5 Flash), which is the same Gemini infrastructure
 *           used by the chat feature. No second AI pipeline is created.
 *
 * FALLBACK: If the AI service is unavailable, rate-limited, or the user
 *           is not authenticated, a deterministic rule-based analysis is
 *           returned using category heuristics + keyword matching so the
 *           UI always remains functional during the demo.
 *
 * Results are cached in memory per issue ID for the session lifetime.
 */

import { Issue } from "@/shared/types/domain/Issue";
import { IssueStatus } from "@/shared/types/domain/IssueStatus";
import { supabase } from "@/integrations/supabase/client";
import { env } from "@/shared/config/environment";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IssueInsight {
  severity: "low" | "medium" | "high" | "critical";
  department: string;
  estimatedResolutionDays: number;
  aiSummary: string;
  priority: "low" | "medium" | "high" | "urgent";
  possibleDuplicates: string;
  /** true when the insight was computed locally (AI unavailable) */
  isRuleBased?: boolean;
}

// ---------------------------------------------------------------------------
// In-memory cache
// ---------------------------------------------------------------------------
const _cache = new Map<string, IssueInsight>();

// ---------------------------------------------------------------------------
// Rule-based fallback data
// ---------------------------------------------------------------------------

const DEPARTMENT_MAP: Record<string, string> = {
  "Water Supply":    "Jal Board / Water Corporation",
  "जल आपूर्ति":     "Jal Board / Jal Nigam",
  "Sanitation":      "Municipal Solid Waste Management",
  "स्वच्छता":       "Nagar Nigam – Solid Waste Dept.",
  "Electricity":     "State Electricity Board / DISCOM",
  "बिजली":          "Rajya Vidyut Board / DISCOM",
  "Roads":           "Public Works Department (PWD)",
  "सड़कें":         "Lok Nirman Vibhag (PWD)",
  "Parks & Gardens": "Horticulture Department",
  "पार्क और बगीचे": "Udyaniki Vibhag",
  "Buildings":       "Building & Construction Department",
  "भवन":            "Bhavan Evam Nirman Vibhag",
};

const RESOLUTION_DAYS_MAP: Record<string, number> = {
  "Water Supply":    5,  "जल आपूर्ति":     5,
  "Sanitation":      3,  "स्वच्छता":       3,
  "Electricity":     2,  "बिजली":          2,
  "Roads":           21, "सड़कें":         21,
  "Parks & Gardens": 10, "पार्क और बगीचे": 10,
  "Buildings":       30, "भवन":            30,
};

const BASE_SEVERITY_MAP: Record<string, IssueInsight["severity"]> = {
  "Water Supply":    "high",   "जल आपूर्ति":     "high",
  "Sanitation":      "medium", "स्वच्छता":       "medium",
  "Electricity":     "high",   "बिजली":          "high",
  "Roads":           "medium", "सड़कें":         "medium",
  "Parks & Gardens": "low",    "पार्क और बगीचे": "low",
  "Buildings":       "medium", "भवन":            "medium",
};

const CRITICAL_KEYWORDS = [
  "emergency", "fire", "explosion", "death", "injury", "collapse",
  "आग", "मृत्यु", "ध्वस्त", "हादसा",
];
const HIGH_KEYWORDS = [
  "flood", "burst", "leak", "dangerous", "broken", "accident", "sewage",
  "खतरा", "टूट", "रिसाव", "जल-भराव", "दुर्घटना",
];

function computeRuleBasedInsight(issue: Issue): IssueInsight {
  const cat = issue.category as string;
  const searchText = `${issue.title} ${issue.description ?? ""}`.toLowerCase();

  // Determine severity
  let severity: IssueInsight["severity"] =
    BASE_SEVERITY_MAP[cat] ?? "medium";

  if (CRITICAL_KEYWORDS.some((k) => searchText.includes(k))) {
    severity = "critical";
  } else if (HIGH_KEYWORDS.some((k) => searchText.includes(k))) {
    severity = severity === "low" ? "medium" : "high";
  }

  // Community engagement bumps severity
  if (issue.supportsCount >= 50) severity = "critical";
  else if (issue.supportsCount >= 20 && severity === "low") severity = "medium";
  else if (issue.supportsCount >= 20 && severity === "medium") severity = "high";

  // Resolution time (faster for critical)
  const baseDays = RESOLUTION_DAYS_MAP[cat] ?? 14;
  const daysMultiplier =
    severity === "critical" ? 0.5
    : severity === "high"   ? 1
    : severity === "medium" ? 1.5
    : 2;
  const estimatedResolutionDays = Math.max(1, Math.round(baseDays * daysMultiplier));

  // Priority
  const priority: IssueInsight["priority"] =
    severity === "critical"       ? "urgent"
    : severity === "high"         ? "high"
    : issue.supportsCount > 10    ? "high"
    : severity === "medium"       ? "medium"
    : "low";

  const department = DEPARTMENT_MAP[cat] ?? "Municipal Corporation";
  const locationNote = issue.location ? ` in ${issue.location}` : "";
  const supportNote =
    issue.supportsCount > 0
      ? ` This issue has ${issue.supportsCount} community support${issue.supportsCount !== 1 ? "s" : ""}, reflecting its significance to local residents.`
      : "";

  const aiSummary =
    `This ${cat} issue${locationNote} requires attention from the ${department}.` +
    supportNote +
    ` Based on category analysis, it is classified as ${severity} severity and should be actioned as a ${priority} priority.`;

  const possibleDuplicates =
    issue.supportsCount > 5
      ? "High community engagement suggests similar reports may exist nearby. Review the map for related issues in the same area."
      : "Limited engagement suggests this may be an isolated report. Monitor for additional complaints in the vicinity.";

  return {
    severity,
    department,
    estimatedResolutionDays,
    aiSummary,
    priority,
    possibleDuplicates,
    isRuleBased: true,
  };
}

// ---------------------------------------------------------------------------
// Gemini SSE stream reader (reuses samadhan-chat format)
// ---------------------------------------------------------------------------
async function readSSEStream(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";

  const decoder = new TextDecoder();
  let fullText = "";
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let nlIdx: number;
      while ((nlIdx = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nlIdx).trim();
        buffer = buffer.slice(nlIdx + 1);

        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6);
        if (data === "[DONE]") return fullText;

        try {
          const parsed = JSON.parse(data);
          const text = parsed.choices?.[0]?.delta?.content;
          if (text) fullText += text;
        } catch {
          // ignore incomplete SSE chunks
        }
      }
    }
  } catch (e) {
    console.warn("[aiInsightService] Stream read error:", e);
  }

  return fullText;
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------
function buildPrompt(issue: Issue): string {
  return `You are a civic issue analysis AI for Indian municipal governance. Analyze this reported civic issue.

Issue Details:
- Title: ${issue.title}
- Category: ${issue.category}
- Description: ${issue.description || "Not provided"}
- Location: ${issue.location || "Not specified"}
- Status: ${issue.status}
- Community Supports: ${issue.supportsCount}

Respond with ONLY a raw JSON object (no markdown, no explanation, no extra text):
{
  "severity": "low" | "medium" | "high" | "critical",
  "department": "specific Indian government department name",
  "estimatedResolutionDays": <integer between 1 and 365>,
  "aiSummary": "<2-3 sentence civic analysis>",
  "priority": "low" | "medium" | "high" | "urgent",
  "possibleDuplicates": "<1 sentence on duplicate likelihood>"
}`;
}

// ---------------------------------------------------------------------------
// Public service
// ---------------------------------------------------------------------------

export const aiInsightService = {
  /**
   * Primary path: calls the samadhan-chat Gemini Edge Function.
   * Fallback: returns a deterministic rule-based insight when AI is
   * unavailable, rate-limited, or the user is unauthenticated.
   * Results are always cached per issue ID.
   */
  async generateIssueInsight(issue: Issue): Promise<IssueInsight> {
    // Serve from cache if available
    if (_cache.has(issue.id)) {
      return _cache.get(issue.id)!;
    }

    // ── Try Gemini path first ─────────────────────────────────────────────
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (session) {
        const endpoint = `${env.supabaseUrl}/functions/v1/samadhan-chat`;

        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            messages: [{ role: "user", content: buildPrompt(issue) }],
          }),
          signal: AbortSignal.timeout(25_000),
        });

        if (response.ok) {
          const rawText = await readSSEStream(response);
          const jsonMatch = rawText.match(/\{[\s\S]*\}/);

          if (jsonMatch) {
            const insight = JSON.parse(jsonMatch[0]) as IssueInsight;

            // Validate required fields
            if (
              insight.severity &&
              insight.department &&
              insight.aiSummary &&
              typeof insight.estimatedResolutionDays === "number"
            ) {
              insight.isRuleBased = false;
              _cache.set(issue.id, insight);
              return insight;
            }
          }
        } else {
          console.warn("[aiInsightService] Edge function HTTP error:", response.status);
        }
      }
    } catch (e) {
      console.warn("[aiInsightService] Gemini path failed, using rule-based fallback:", e);
    }

    // ── Rule-based fallback (always works, no API call) ───────────────────
    const fallback = computeRuleBasedInsight(issue);
    _cache.set(issue.id, fallback);
    return fallback;
  },

  /** Clears the in-memory cache (call on sign-out or when stale). */
  clearCache() {
    _cache.clear();
  },

  /** Synchronously generates rule-based insights using fallback logic. Used in map popups. */
  getSyncInsight(issue: Issue): IssueInsight {
    if (_cache.has(issue.id)) {
      return _cache.get(issue.id)!;
    }
    const insight = computeRuleBasedInsight(issue);
    _cache.set(issue.id, insight);
    return insight;
  },
};
