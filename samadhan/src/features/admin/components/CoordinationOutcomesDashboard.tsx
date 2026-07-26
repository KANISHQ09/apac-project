import React, { useState, useEffect, useCallback } from "react";
import { closureService } from "@/features/coordination";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/shared/hooks/use-toast";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import {
  BarChart3,
  TrendingDown,
  TrendingUp,
  Clock,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  Loader2,
  Target,
  Activity,
} from "lucide-react";
import type { CoordinationMetrics } from "@/shared/types/domain/Issue";

type DateRange = "7d" | "30d" | "90d";

const DATE_RANGES: { label: string; value: DateRange; days: number }[] = [
  { label: "7 Days", value: "7d", days: 7 },
  { label: "30 Days", value: "30d", days: 30 },
  { label: "90 Days", value: "90d", days: 90 },
];

interface MetricCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subLabel?: string;
  trend?: "good" | "bad" | "neutral";
}

const MetricCard: React.FC<MetricCardProps> = ({ icon, label, value, subLabel, trend }) => (
  <Card className="border-border/50">
    <CardContent className="pt-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2 text-muted-foreground">{icon}</div>
        {trend === "good" && <TrendingUp className="w-4 h-4 text-green-500" />}
        {trend === "bad" && <TrendingDown className="w-4 h-4 text-red-500" />}
      </div>
      <div className="mt-3">
        <div className="text-2xl font-bold tracking-tight">{value}</div>
        <div className="text-sm font-medium text-muted-foreground mt-0.5">{label}</div>
        {subLabel && <div className="text-xs text-muted-foreground/70 mt-0.5">{subLabel}</div>}
      </div>
    </CardContent>
  </Card>
);

export const CoordinationOutcomesDashboard: React.FC = () => {
  const { toast } = useToast();
  const [metrics, setMetrics] = useState<CoordinationMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<DateRange>("30d");

  const load = useCallback(async () => {
    setLoading(true);
    const days = DATE_RANGES.find((r) => r.value === range)?.days ?? 30;
    const dateFrom = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const dateTo = new Date().toISOString();
    try {
      const data = await closureService.getCoordinationMetrics(dateFrom, dateTo);
      setMetrics(data);
    } catch (err: any) {
      toast({ title: "Failed to load metrics", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [range, toast]);

  useEffect(() => { load(); }, [load]);

  // Efficiency index: composite of key indicators (transparent formula)
  const efficiencyIndex = metrics
    ? Math.max(
        0,
        100
        - (metrics.reworkRatePct || 0) * 0.3         // rework penalty
        - (metrics.slaBreachRatePct || 0) * 0.25      // SLA breach penalty
        - (metrics.reopenRatePct || 0) * 0.2           // reopen penalty
        + (metrics.firstTimeResolutionRatePct || 0) * 0.25  // bonus for first-time closure
      ).toFixed(1)
    : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            Coordination Effectiveness
          </h2>
          <p className="text-sm text-muted-foreground">
            Operational metrics for inter-departmental coordination quality
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border overflow-hidden">
            {DATE_RANGES.map((r) => (
              <button
                key={r.value}
                onClick={() => setRange(r.value)}
                className={`px-3 py-1 text-xs font-medium transition-colors ${
                  range === r.value
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted/50 text-muted-foreground"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <Button variant="ghost" size="sm" onClick={load}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {loading && !metrics && (
        <div className="flex items-center gap-3 py-8 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading coordination metrics...
        </div>
      )}

      {metrics && (
        <>
          {/* Efficiency Index Banner */}
          {efficiencyIndex !== null && (
            <Card className={`border-2 ${
              Number(efficiencyIndex) >= 75 ? "border-green-500/40 bg-green-500/5"
              : Number(efficiencyIndex) >= 50 ? "border-amber-500/40 bg-amber-500/5"
              : "border-red-500/40 bg-red-500/5"
            }`}>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Inter-Department Coordination Efficiency Index</p>
                    <div className="flex items-end gap-3 mt-1">
                      <span className="text-4xl font-bold">{efficiencyIndex}</span>
                      <span className="text-lg text-muted-foreground mb-1">/ 100</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Formula: 100 − (rework×0.3) − (SLA_breach×0.25) − (reopen×0.2) + (first_time_close×0.25)
                    </p>
                  </div>
                  <Activity className={`w-12 h-12 ${
                    Number(efficiencyIndex) >= 75 ? "text-green-500/50"
                    : Number(efficiencyIndex) >= 50 ? "text-amber-500/50"
                    : "text-red-500/50"
                  }`} />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Metric Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            <MetricCard
              icon={<Target className="w-4 h-4" />}
              label="Multi-Dept Cases"
              value={metrics.totalMultiDeptCases}
              subLabel="Coordinated in period"
            />
            <MetricCard
              icon={<CheckCircle className="w-4 h-4" />}
              label="Total Closed"
              value={metrics.totalClosed}
              subLabel="Joint closures"
            />
            <MetricCard
              icon={<TrendingUp className="w-4 h-4" />}
              label="First-Time Resolution"
              value={`${metrics.firstTimeResolutionRatePct ?? 0}%`}
              subLabel="Closed without reopen"
              trend={metrics.firstTimeResolutionRatePct >= 80 ? "good" : metrics.firstTimeResolutionRatePct < 50 ? "bad" : "neutral"}
            />
            <MetricCard
              icon={<RefreshCw className="w-4 h-4" />}
              label="Reopen Rate"
              value={`${metrics.reopenRatePct ?? 0}%`}
              subLabel="Cases reopened after closure"
              trend={metrics.reopenRatePct <= 10 ? "good" : "bad"}
            />
            <MetricCard
              icon={<Clock className="w-4 h-4" />}
              label="Avg Handoff Acceptance"
              value={`${Math.round(metrics.avgHandoffAcceptanceMinutes ?? 0)} min`}
              subLabel="Submit → accepted"
              trend={metrics.avgHandoffAcceptanceMinutes < 60 ? "good" : "bad"}
            />
            <MetricCard
              icon={<AlertCircle className="w-4 h-4" />}
              label="Rework Rate"
              value={`${metrics.reworkRatePct ?? 0}%`}
              subLabel="Rejected handoffs / total"
              trend={metrics.reworkRatePct <= 15 ? "good" : "bad"}
            />
            <MetricCard
              icon={<AlertCircle className="w-4 h-4" />}
              label="SLA Breach Rate"
              value={`${metrics.slaBreachRatePct ?? 0}%`}
              subLabel="Tasks that missed SLA"
              trend={metrics.slaBreachRatePct <= 10 ? "good" : "bad"}
            />
            <MetricCard
              icon={<BarChart3 className="w-4 h-4" />}
              label="Total Escalations"
              value={metrics.totalEscalations}
              subLabel="Across all cases in period"
            />
          </div>

          {/* Interpretation Notes */}
          <Card className="border-border/30 bg-muted/20">
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground leading-relaxed">
                <strong className="text-foreground">How to read this:</strong>{" "}
                Rework Rate measures coordination quality (rejected handoffs force rework loops).
                SLA Breach Rate shows delay patterns. Reopen Rate reveals unresolved root causes.
                First-Time Resolution Rate is the primary success indicator.
                All metrics use live database data — no hardcoded values.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};
