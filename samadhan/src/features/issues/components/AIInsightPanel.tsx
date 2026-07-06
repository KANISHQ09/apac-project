import { useState, useEffect } from "react";
import { Issue } from "@/shared/types/domain/Issue";
import { aiInsightService, IssueInsight } from "../services/aiInsightService";
import { useLanguage } from "@/app/providers/LanguageProvider";
import {
  Sparkles,
  Building2,
  Clock,
  AlertTriangle,
  Loader2,
  Zap,
  Shield,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface AIInsightPanelProps {
  issue: Issue;
}

// ---------------------------------------------------------------------------
// Severity / Priority config
// ---------------------------------------------------------------------------
const SEVERITY_CONFIG: Record<
  string,
  { en: string; hi: string; cls: string }
> = {
  low:      { en: "Low",      hi: "निम्न",   cls: "bg-green-500/10  text-green-500  border-green-500/30"  },
  medium:   { en: "Medium",   hi: "मध्यम",   cls: "bg-yellow-500/10 text-yellow-500 border-yellow-500/30" },
  high:     { en: "High",     hi: "उच्च",    cls: "bg-orange-500/10 text-orange-500 border-orange-500/30" },
  critical: { en: "Critical", hi: "गंभीर",   cls: "bg-red-500/10    text-red-500    border-red-500/30"    },
};

const PRIORITY_CONFIG: Record<string, { en: string; hi: string; cls: string }> = {
  low:    { en: "Low",        hi: "निम्न",     cls: "text-green-500"  },
  medium: { en: "Medium",     hi: "मध्यम",     cls: "text-yellow-500" },
  high:   { en: "High",       hi: "उच्च",      cls: "text-orange-500" },
  urgent: { en: "Urgent 🚨",  hi: "तत्काल 🚨", cls: "text-red-500"   },
};

// ---------------------------------------------------------------------------
// Skeleton helper
// ---------------------------------------------------------------------------
function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-muted/60 rounded-lg ${className}`} />;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export function AIInsightPanel({ issue }: AIInsightPanelProps) {
  const { language } = useLanguage();
  const [insight, setInsight] = useState<IssueInsight | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    setInsight(null);

    aiInsightService.generateIssueInsight(issue).then((result) => {
      if (cancelled) return;
      if (result) {
        setInsight(result);
      } else {
        setFailed(true);
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [issue.id]);

  const sev = insight ? (SEVERITY_CONFIG[insight.severity] ?? SEVERITY_CONFIG.medium) : null;
  const pri = insight ? (PRIORITY_CONFIG[insight.priority] ?? PRIORITY_CONFIG.medium) : null;

  return (
    <div className="mt-5 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 via-accent/3 to-transparent overflow-hidden">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-primary/15 bg-primary/5">
        <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
        </div>
        <div className="flex-1">
          <p className="text-xs font-bold text-foreground leading-none">
            {language === "en" ? "AI Intelligence Report" : "AI इंटेलिजेंस रिपोर्ट"}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {language === "en" ? "Powered by Gemini 2.5 Flash" : "Gemini 2.5 Flash द्वारा"}
          </p>
        </div>
        {loading && (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-primary shrink-0" />
        )}
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="p-4">
        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </div>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        )}

        {/* Error / unavailable */}
        {failed && !loading && (
          <div className="flex items-start gap-2 py-2">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              {language === "en"
                ? "AI analysis is currently unavailable. The Gemini service may not be configured."
                : "AI विश्लेषण अभी उपलब्ध नहीं है। Gemini सेवा कॉन्फ़िगर नहीं हो सकती।"}
            </p>
          </div>
        )}

        {/* Insight content */}
        {insight && !loading && (
          <div className="space-y-4">
            {/* Severity + Priority row */}
            <div className="grid grid-cols-2 gap-2">
              <div className={`rounded-xl p-3 border ${sev!.cls}`}>
                <div className="flex items-center gap-1 mb-1.5">
                  <Shield className="w-3.5 h-3.5" />
                  <p className="text-[10px] font-bold uppercase tracking-wider opacity-75">
                    {language === "en" ? "Severity" : "गंभीरता"}
                  </p>
                </div>
                <p className="text-sm font-bold">
                  {language === "hi" ? sev!.hi : sev!.en}
                </p>
              </div>
              <div className="rounded-xl p-3 border border-border/50 bg-muted/20">
                <div className="flex items-center gap-1 mb-1.5">
                  <Zap className="w-3.5 h-3.5 text-muted-foreground" />
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {language === "en" ? "Priority" : "प्राथमिकता"}
                  </p>
                </div>
                <p className={`text-sm font-bold ${pri!.cls}`}>
                  {language === "hi" ? pri!.hi : pri!.en}
                </p>
              </div>
            </div>

            {/* Recommended Department */}
            <div className="flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0 mt-0.5">
                <Building2 className="w-3.5 h-3.5 text-blue-500" />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground mb-0.5">
                  {language === "en" ? "Recommended Department" : "अनुशंसित विभाग"}
                </p>
                <p className="text-sm font-bold text-foreground">{insight.department}</p>
              </div>
            </div>

            {/* Estimated resolution */}
            <div className="flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0 mt-0.5">
                <Clock className="w-3.5 h-3.5 text-amber-500" />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground mb-0.5">
                  {language === "en" ? "Est. Resolution Time" : "अनुमानित समाधान"}
                </p>
                <p className="text-sm font-bold text-foreground">
                  ~{insight.estimatedResolutionDays}{" "}
                  {language === "en"
                    ? `day${insight.estimatedResolutionDays !== 1 ? "s" : ""}`
                    : "दिन"}
                </p>
              </div>
            </div>

            {/* AI Summary */}
            <div className="bg-muted/20 rounded-xl p-3 border border-border/40">
              <div className="flex items-center gap-1.5 mb-2">
                <Sparkles className="w-3 h-3 text-primary" />
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  {language === "en" ? "AI Analysis" : "AI विश्लेषण"}
                </p>
              </div>
              <p className="text-xs text-foreground leading-relaxed">{insight.aiSummary}</p>
            </div>

            {/* Duplicate note */}
            {insight.possibleDuplicates && (
              <p className="text-[11px] text-muted-foreground border-t border-border/40 pt-2 italic leading-relaxed">
                <span className="font-semibold not-italic text-foreground">
                  {language === "en" ? "Note:" : "नोट:"}
                </span>{" "}
                {insight.possibleDuplicates}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
