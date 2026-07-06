import { useState, useEffect, useMemo } from "react";
import { User } from "@supabase/supabase-js";
import { gamificationService } from "../../profile/services/gamificationService";
import { issueRepository, issueService } from "@/features/issues";
import { issueVerificationService } from "@/features/issues/services/issueVerificationService";
import { dashboardService, DashboardStats } from "../services/dashboardService";
import { Issue } from "@/shared/types/domain/Issue";
import { useToast } from "@/shared/hooks/use-toast";
import { logger } from "@/shared/services/logger";
import { APIError } from "@/shared/errors/errors";

// Helper for Haversine distance calculation in kilometers
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function useDashboardIssues(
  user: User | null,
  activeLanguage: "en" | "hi",
  userCoords: { lat: number; lng: number } | null = null
) {
  const { toast } = useToast();
  const [allIssues, setAllIssues] = useState<Issue[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]); // proximity filtered
  const [supportedIssues, setSupportedIssues] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [supportingId, setSupportingId] = useState<string | null>(null);
  const [isNearbyMode, setIsNearbyMode] = useState(false);

  useEffect(() => {
    fetchIssues();
    if (user) {
      fetchUserSupports();
    } else {
      setSupportedIssues(new Set());
    }
  }, [user, userCoords]);

  // Memoize stats to avoid extra render cycles - computed on ALL issues
  const stats = useMemo<DashboardStats>(() => {
    return dashboardService.calculateStats(allIssues);
  }, [allIssues]);

  // Realtime subscription setup
  useEffect(() => {
    const unsubscribe = issueRepository.subscribeToIssuesChange((payload) => {
      logger.info("Realtime reported_issues change received:", payload);
      if (payload.eventType === "INSERT") {
        const newIssue = issueService.mapResponseToDomain(payload.new as any);
        setAllIssues((prev) => [newIssue, ...prev]);
        setIssues((prev) => [newIssue, ...prev]);
      } else if (payload.eventType === "UPDATE") {
        const updatedIssue = issueService.mapResponseToDomain(payload.new as any);
        setAllIssues((prev) =>
          prev.map((issue) => (issue.id === updatedIssue.id ? updatedIssue : issue))
        );
        setIssues((prev) =>
          prev.map((issue) => (issue.id === updatedIssue.id ? updatedIssue : issue))
        );
      } else if (payload.eventType === "DELETE") {
        setAllIssues((prev) => prev.filter((issue) => issue.id !== payload.old.id));
        setIssues((prev) => prev.filter((issue) => issue.id !== payload.old.id));
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const fetchIssues = async () => {
    try {
      setLoading(true);
      // Fetch up to 100 issues if coordinates are provided to filter, otherwise fetch 20
      const limit = userCoords ? 100 : 20;
      const raw = await issueRepository.fetchAllIssues(limit);
      const mapped = raw.map((item) => issueService.mapResponseToDomain(item));
      setAllIssues(mapped);

      if (userCoords) {
        const withDistance = mapped
          .filter((issue) => issue.latitude !== null && issue.longitude !== null)
          .map((issue) => {
            const dist = haversineDistance(
              userCoords.lat,
              userCoords.lng,
              issue.latitude!,
              issue.longitude!
            );
            return { issue, dist };
          });

        // Filter to issues within 50km radius
        const nearby = withDistance.filter((item) => item.dist <= 50);

        if (nearby.length > 0) {
          // Sort by distance (closest first)
          nearby.sort((a, b) => a.dist - b.dist);
          setIssues(nearby.map((n) => n.issue));
          setIsNearbyMode(true);
        } else {
          // Fallback to showing all issues if none found within 50km
          setIssues(mapped);
          setIsNearbyMode(false);
        }
      } else {
        setIssues(mapped);
        setIsNearbyMode(false);
      }
    } catch (err) {
      logger.error("Failed to load issues:", err);
      toast({
        title: activeLanguage === "en" ? "Error" : "त्रुटि",
        description: activeLanguage === "en" ? "Failed to load issues" : "समस्याएं लोड करने में विफल",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchUserSupports = async () => {
    if (!user) return;
    try {
      const supports = await issueRepository.fetchUserSupports(user.id);
      setSupportedIssues(new Set(supports.map((s) => s.issue_id)));
    } catch (err) {
      logger.error("Failed to load user supports:", err);
    }
  };

  const handleSupport = async (issueId: string) => {
    if (!user) {
      toast({
        title: activeLanguage === "en" ? "Sign in Required" : "साइन इन आवश्यक",
        description:
          activeLanguage === "en"
            ? "Please sign in to support this issue."
            : "इस समस्या का समर्थन करने के लिए कृपया साइन इन करें।",
        variant: "destructive",
      });
      return;
    }

    setSupportingId(issueId);
    const isSupported = supportedIssues.has(issueId);

    // Optimistic UI updates
    setSupportedIssues((prev) => {
      const updated = new Set(prev);
      if (isSupported) updated.delete(issueId);
      else updated.add(issueId);
      return updated;
    });

    setIssues((prev) =>
      prev.map((issue) =>
        issue.id === issueId
          ? {
              ...issue,
              supportsCount: Math.max(0, issue.supportsCount + (isSupported ? -1 : 1)),
            }
          : issue
      )
    );

    setAllIssues((prev) =>
      prev.map((issue) =>
        issue.id === issueId
          ? {
              ...issue,
              supportsCount: Math.max(0, issue.supportsCount + (isSupported ? -1 : 1)),
            }
          : issue
      )
    );

    try {
      await issueService.toggleSupport(issueId, user.id, isSupported);
      gamificationService.dispatchGamificationUpdate();
      if (!isSupported) {
        const title = allIssues.find((i) => i.id === issueId)?.title;
        await issueVerificationService.voteOnIssue(issueId, "confirm", title);

        toast({
          title: activeLanguage === "en" ? "Issue Supported!" : "समस्या समर्थित!",
          description:
            activeLanguage === "en"
              ? "Thank you for supporting this community issue."
              : "इस सामुदायिक समस्या का समर्थन करने के लिए धन्यवाद।",
        });
      }
    } catch (err: any) {
      logger.error("Failed to toggle support:", err);
      // Rollback optimistic state
      setSupportedIssues((prev) => {
        const rollback = new Set(prev);
        if (isSupported) rollback.add(issueId);
        else rollback.delete(issueId);
        return rollback;
      });
      setIssues((prev) =>
        prev.map((issue) =>
          issue.id === issueId
            ? {
                ...issue,
                supportsCount: Math.max(0, issue.supportsCount + (isSupported ? 1 : -1)),
              }
            : issue
        )
      );
      setAllIssues((prev) =>
        prev.map((issue) =>
          issue.id === issueId
            ? {
                ...issue,
                supportsCount: Math.max(0, issue.supportsCount + (isSupported ? 1 : -1)),
              }
            : issue
        )
      );

      toast({
        title: activeLanguage === "en" ? "Error" : "त्रुटि",
        description: err.message || "Failed to process support request.",
        variant: "destructive",
      });
    } finally {
      setSupportingId(null);
    }
  };

  return {
    issues,
    allIssues,
    supportedIssues,
    loading,
    supportingId,
    stats,
    handleSupport,
    isNearbyMode,
    refetch: fetchIssues,
  };
}
