import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { useLanguage } from "@/app/providers/LanguageProvider";
import { useAuth } from "@/features/auth";
import { useDashboardIssues } from "../hooks/useDashboardIssues";
import { Issue } from "@/shared/types/domain/Issue";
import { IssueStatus } from "@/shared/types/domain/IssueStatus";
import { ROUTES } from "@/shared/config/routes";
import { STATUS_LABELS, STATUSES } from "@/shared/constants/statuses";
import { CATEGORY_LABELS } from "@/shared/constants/categories";
import { LoadingState } from "@/shared/components/LoadingState";
import { EmptyState } from "@/shared/components/EmptyState";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from "@/shared/components/ui/dialog";
import { profileService } from "@/features/profile/services/profileService";
import { issueService } from "@/features/issues/services/issueService";
import { issueVerificationService } from "@/features/issues/services/issueVerificationService";
import { aiInsightService } from "@/features/issues/services/aiInsightService";
import { useToast } from "@/shared/hooks/use-toast";
import { logger } from "@/shared/services/logger";
import { 
  MapPin, 
  ThumbsUp, 
  Clock, 
  Droplets,
  Trash2,
  Zap,
  Construction,
  AlertTriangle,
  CheckCircle2,
  Timer,
  Loader2,
  Plus,
  TreePine,
  Building2,
  User,
  Calendar,
  BarChart3,
  Map,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Shield,
  X,
} from "lucide-react";
import { AnalyticsPanel } from "../components/AnalyticsPanel";
import { AIInsightPanel } from "@/features/issues/components/AIInsightPanel";

const categoryIcons: Record<string, React.ReactNode> = {
  "Water Supply": <Droplets className="w-4 h-4" />,
  "जल आपूर्ति": <Droplets className="w-4 h-4" />,
  "Sanitation": <Trash2 className="w-4 h-4" />,
  "स्वच्छता": <Trash2 className="w-4 h-4" />,
  "Electricity": <Zap className="w-4 h-4" />,
  "बिजली": <Zap className="w-4 h-4" />,
  "Roads": <Construction className="w-4 h-4" />,
  "सड़कें": <Construction className="w-4 h-4" />,
  "Parks & Gardens": <TreePine className="w-4 h-4" />,
  "पार्क और बगीचे": <TreePine className="w-4 h-4" />,
  "Buildings": <Building2 className="w-4 h-4" />,
  "भवन": <Building2 className="w-4 h-4" />,
};

const statusConfig: Record<string, { class: string; icon: React.ReactNode }> = {
  [IssueStatus.REPORTED]: { 
    class: "status-reported",
    icon: <AlertTriangle className="w-3 h-3" />
  },
  [IssueStatus.IN_PROGRESS]: { 
    class: "status-in-progress",
    icon: <Timer className="w-3 h-3" />
  },
  [IssueStatus.RESOLVED]: { 
    class: "status-resolved",
    icon: <CheckCircle2 className="w-3 h-3" />
  },
};

import { getTimeAgo as getTimeAgoUtil } from "@/shared/utils/time";

export default function DashboardPage() {
  const { language, t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedIssueId = searchParams.get("issueId");
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [selectedIssueProfile, setSelectedIssueProfile] = useState<{ fullName: string } | null>(null);
  const [loadingSelected, setLoadingSelected] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(true);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [verificationVersion, setVerificationVersion] = useState(0);

  useEffect(() => {
    const handleSync = () => {
      setVerificationVersion((v) => v + 1);
    };
    window.addEventListener("issue_verifications_changed", handleSync);
    return () => window.removeEventListener("issue_verifications_changed", handleSync);
  }, []);

  const handleVote = async (issueId: string, vote: "confirm" | "disagree", title?: string) => {
    await issueVerificationService.voteOnIssue(issueId, vote, title);
    toast({
      title: language === "en" ? "Vote Registered" : "मत दर्ज किया गया",
      description: language === "en" 
        ? "Thank you for contributing to community verification!" 
        : "सामुदायिक सत्यापन में योगदान देने के लिए धन्यवाद!",
    });
  };

  useEffect(() => {
    if (typeof window !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        (err) => {
          logger.info("Geolocation declined or unavailable:", err);
        },
        { enableHighAccuracy: false, timeout: 5000 }
      );
    }
  }, []);

  const {
    issues,
    allIssues,
    supportedIssues,
    loading,
    supportingId,
    stats,
    handleSupport,
    isNearbyMode,
  } = useDashboardIssues(user, language, userCoords);

  const getTimeAgo = (date: Date) => getTimeAgoUtil(date, language);

  useEffect(() => {
    if (!selectedIssueId) {
      setSelectedIssue(null);
      setSelectedIssueProfile(null);
      return;
    }

    const found = issues.find((i) => i.id === selectedIssueId);
    if (found) {
      setSelectedIssue(found);
      fetchReporterProfile(found.userId);
    } else {
      setLoadingSelected(true);
      issueService.getIssueById(selectedIssueId)
        .then((issue) => {
          setSelectedIssue(issue);
          fetchReporterProfile(issue.userId);
        })
        .catch((err) => {
          logger.error("Failed to fetch issue details:", err);
          toast({
            title: language === "en" ? "Error" : "त्रुटि",
            description: language === "en" ? "Issue not found" : "समस्या नहीं मिली",
            variant: "destructive",
          });
          searchParams.delete("issueId");
          setSearchParams(searchParams);
        })
        .finally(() => {
          setLoadingSelected(false);
        });
    }
  }, [selectedIssueId, issues]);

  const fetchReporterProfile = async (reporterUserId: string) => {
    if (!user) {
      setSelectedIssueProfile({ fullName: language === "en" ? "Citizen" : "नागरिक" });
      return;
    }

    if (reporterUserId === user.id) {
      try {
        const prof = await profileService.getProfile(user.id);
        setSelectedIssueProfile({ fullName: prof.fullName || (language === "en" ? "You" : "आप") });
      } catch {
        setSelectedIssueProfile({ fullName: language === "en" ? "You" : "आप" });
      }
      return;
    }

    try {
      const prof = await profileService.getProfile(reporterUserId);
      setSelectedIssueProfile({ fullName: prof.fullName || (language === "en" ? "Citizen" : "नागरिक") });
    } catch {
      setSelectedIssueProfile({ fullName: language === "en" ? "Citizen" : "नागरिक" });
    }
  };

  const handleViewDetails = (issueId: string) => {
    setSearchParams({ issueId });
  };

  const handleViewOnMap = (issueId: string) => {
    navigate(`${ROUTES.CIVIC_MAP}?issueId=${issueId}`);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-10">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary/10 rounded-full text-primary text-sm font-medium mb-4">
            <MapPin className="w-4 h-4" />
            {t("issues.badge")}
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-2">
            {t("issues.title")}
          </h1>
          <p className="text-muted-foreground">
            {t("issues.subtitle")}
          </p>
        </div>
        <Link to={ROUTES.REPORT_ISSUE}>
          <Button className="shrink-0 gap-2">
            <Plus className="w-4 h-4" />
            {language === "en" ? "Report Issue" : "समस्या दर्ज करें"}
          </Button>
        </Link>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <StatCard 
          value={stats.aiClassifiedCount.toString()} 
          label={language === "en" ? "AI Classifications" : "एआई वर्गीकरण"}
          trend={language === "en" ? "🤖 Powered by Gemini" : "🤖 जेमिनी द्वारा"} 
          color="primary"
        />
        <StatCard 
          value={stats.duplicateCount.toString()} 
          label={language === "en" ? "Duplicates Prevented" : "रोके गए डुप्लिकेट"}
          trend={language === "en" ? "Duplicate Issues Prevented" : "रोके गए डुप्लिकेट मुद्दे"} 
          color="accent"
        />
        <StatCard 
          value={stats.avgResolutionDays !== null ? `${stats.avgResolutionDays} days` : (language === "en" ? "No resolved issues yet" : "कोई हल मुद्दा नहीं")} 
          label={language === "en" ? "Avg Resolution" : "औसत समाधान"}
          trend={language === "en" ? "Dynamic resolution average" : "गतिशील समाधान औसत"} 
          color="info" 
        />
        <StatCard 
          value={stats.geoTaggedCount.toString()} 
          label={language === "en" ? "Geo-tagged Reports" : "जियो-टैग की गई रिपोर्ट"}
          trend={language === "en" ? `${Math.round((stats.geoTaggedCount / (allIssues.length || 1)) * 100)}% map coverage` : `${Math.round((stats.geoTaggedCount / (allIssues.length || 1)) * 100)}% मानचित्र कवरेज`} 
          color="warning"
          mapHref={ROUTES.CIVIC_MAP}
        />
        <StatCard 
          value={stats.issuesThisWeek.toString()} 
          label={language === "en" ? "Issues This Week" : "इस सप्ताह के मुद्दे"}
          trend={language === "en" ? "New reports (7d)" : "नई रिपोर्ट (7 दिन)"} 
          color="primary"
        />
      </div>

      {/* Analytics Section */}
      <div className="mb-8">
        <button
          className="flex items-center gap-2 mb-4 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors group"
          onClick={() => setShowAnalytics((v) => !v)}
        >
          <BarChart3 className="w-4.5 h-4.5 text-primary" />
          {language === "en" ? "Civic Analytics" : "नागरिक विश्लेषण"}
          {showAnalytics
            ? <ChevronUp className="w-3.5 h-3.5 ml-1 group-hover:text-primary transition-colors" />
            : <ChevronDown className="w-3.5 h-3.5 ml-1 group-hover:text-primary transition-colors" />}
        </button>
        {showAnalytics && <AnalyticsPanel issues={allIssues} />}
      </div>

      {/* Issues Grid */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
          </span>
          {language === "en" ? "Live Issues Feed" : "लाइव समस्या फ़ीड"}
          <Badge variant="outline" className="text-[9px] bg-green-500/10 text-green-500 border-green-500/20 px-1.5 py-0 uppercase font-extrabold animate-pulse flex items-center gap-1 shrink-0">
            ● {language === "en" ? "Live" : "लाइव"}
          </Badge>
        </h2>
        <div className="flex items-center gap-2">
          {isNearbyMode ? (
            <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 animate-bounce" />
              {language === "en" ? "Showing issues near you" : "आपके पास की समस्याएं"}
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-muted-foreground bg-muted/40">
              {language === "en" ? "Showing all issues" : "सभी समस्याएं दिखाई जा रही हैं"}
            </Badge>
          )}
        </div>
      </div>
      {loading ? (
        <LoadingState message={language === "en" ? "Loading issues..." : "समस्याएं लोड हो रही हैं..."} />
      ) : issues.length === 0 ? (
        <EmptyState
          title={language === "en" ? "No Issues Reported" : "कोई समस्या दर्ज नहीं"}
          description={
            language === "en" 
              ? "Be the first to report an issue in your community." 
              : "अपने समुदाय में पहली समस्या दर्ज करने वाले बनें।"
          }
          actionText={language === "en" ? "Report an Issue" : "समस्या दर्ज करें"}
          onAction={() => navigate(ROUTES.REPORT_ISSUE)}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {issues.map((issue, index) => (
            <IssueCard 
              key={issue.id} 
              issue={issue} 
              index={index} 
              isSupported={supportedIssues.has(issue.id)}
              isSupporting={supportingId === issue.id}
              onSupport={() => handleSupport(issue.id)}
              onViewDetails={() => handleViewDetails(issue.id)}
              onViewOnMap={issue.latitude && issue.longitude ? () => handleViewOnMap(issue.id) : undefined}
              getTimeAgo={getTimeAgo}
              activeLanguage={language}
            />
          ))}
        </div>
      )}

      {/* Complaint Detail Dialog */}
      <Dialog 
        open={!!selectedIssueId} 
        onOpenChange={(open) => {
          if (!open) {
            searchParams.delete("issueId");
            setSearchParams(searchParams);
          }
        }}
      >
        <DialogContent className="max-w-xl overflow-y-auto max-h-[90vh] p-0 border-none bg-card/95 backdrop-blur-md shadow-2xl rounded-2xl">
          {loadingSelected || !selectedIssue ? (
            <div className="p-12 flex flex-col items-center justify-center gap-4">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                {language === "en" ? "Loading details..." : "विवरण लोड हो रहा है..."}
              </p>
            </div>
          ) : (
            (() => {
              const { confirmations, disagreements, confidence, isVerified, userVote } = 
                issueVerificationService.getComputedState(selectedIssue.id, selectedIssue.title);
              const insight = aiInsightService.getSyncInsight(selectedIssue);
              const hasDepartment = !!insight?.department;

              const timelineSteps = [
                { key: "reported", labelEn: "Reported", labelHi: "दर्ज की गई", complete: true },
                { key: "ai_categorized", labelEn: "AI Categorized", labelHi: "एआई वर्गीकृत", complete: !!selectedIssue.category },
                { key: "community_verified", labelEn: "Verified", labelHi: "सत्यापित", complete: isVerified },
                { key: "department_assigned", labelEn: "Dept Assigned", labelHi: "विभाग", complete: hasDepartment || selectedIssue.status === IssueStatus.IN_PROGRESS || selectedIssue.status === IssueStatus.RESOLVED },
                { key: "in_progress", labelEn: "In Progress", labelHi: "प्रगति में", complete: selectedIssue.status === IssueStatus.IN_PROGRESS || selectedIssue.status === IssueStatus.RESOLVED },
                { key: "resolved", labelEn: "Resolved", labelHi: "सुलझाया गया", complete: selectedIssue.status === IssueStatus.RESOLVED },
              ];

              return (
                <div key={verificationVersion} className="flex flex-col">
                  {/* Header Image or Colored Banner */}
                  {selectedIssue.imageUrls && selectedIssue.imageUrls.length > 0 ? (
                    <div className="relative w-full h-56 bg-muted overflow-hidden">
                      <img 
                        src={selectedIssue.imageUrls[0]} 
                        alt={selectedIssue.title}
                        className="w-full h-full object-cover animate-fade-in"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent" />
                    </div>
                  ) : (
                    <div className="w-full h-24 bg-gradient-to-r from-primary/10 to-accent/10 relative" />
                  )}

                  {/* Main Content Area */}
                  <div className="p-6">
                    <div className="flex flex-wrap items-center gap-2 mb-4">
                      <Badge variant="secondary" className="text-xs">
                        {selectedIssue.category}
                      </Badge>
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        statusConfig[selectedIssue.status]?.class || statusConfig[IssueStatus.REPORTED].class
                      }`}>
                        {statusConfig[selectedIssue.status]?.icon || statusConfig[IssueStatus.REPORTED].icon}
                        {STATUS_LABELS[selectedIssue.status]?.[language] || selectedIssue.status}
                      </span>
                      {isVerified && (
                        <Badge className="bg-green-500/10 text-green-500 border-green-500/20 text-[10px] font-bold py-0.5 px-2">
                          ✓ {language === "en" ? "Community Verified" : "सामुदायिक सत्यापित"}
                        </Badge>
                      )}
                    </div>

                    <DialogTitle className="text-2xl font-bold text-foreground mb-4">
                      {selectedIssue.title}
                    </DialogTitle>

                    {/* Metadata Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-muted/30 rounded-xl mb-6 border border-border/50">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                          <User className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
                            {language === "en" ? "Issued By" : "द्वारा जारी"}
                          </p>
                          <p className="text-sm font-semibold text-foreground">
                            {selectedIssueProfile?.fullName || (language === "en" ? "Citizen" : "नागरिक")}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-lg bg-accent/10 text-accent flex items-center justify-center shrink-0">
                          <Calendar className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
                            {language === "en" ? "Reported On" : "रिपोर्ट की तिथि"}
                          </p>
                          <p className="text-sm font-semibold text-foreground">
                            {new Date(selectedIssue.createdAt).toLocaleDateString(language === "en" ? "en-US" : "hi-IN", {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric'
                            })}
                          </p>
                        </div>
                      </div>

                      {selectedIssue.location && (
                        <div className="flex items-center gap-2.5 sm:col-span-2">
                          <div className="w-9 h-9 rounded-lg bg-info/10 text-info flex items-center justify-center shrink-0">
                            <MapPin className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
                              {language === "en" ? "Location" : "स्थान"}
                            </p>
                            <p className="text-sm font-semibold text-foreground truncate">
                              {selectedIssue.location}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Visual Lifecycle Timeline */}
                    <div className="mb-6">
                      <h4 className="text-sm font-bold text-foreground mb-3 flex items-center gap-1.5">
                        <Clock className="w-4 h-4 text-primary" />
                        {language === "en" ? "Issue Lifecycle Timeline" : "समस्या जीवनचक्र समयरेखा"}
                      </h4>
                      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 p-3 bg-muted/20 border border-border/40 rounded-xl">
                        {timelineSteps.map((step, idx) => (
                          <div key={step.key} className="flex flex-col items-center text-center relative">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold z-10 ${
                              step.complete 
                                ? "bg-green-500 text-white" 
                                : "bg-muted text-muted-foreground border border-border"
                            }`}>
                              {step.complete ? "✓" : idx + 1}
                            </div>
                            <span className="text-[10px] font-semibold mt-1.5 text-foreground leading-tight line-clamp-2 px-0.5">
                              {language === "en" ? step.labelEn : step.labelHi}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Description */}
                    <div className="mb-4">
                      <h4 className="text-sm font-bold text-foreground mb-2">
                        {language === "en" ? "Description" : "विवरण"}
                      </h4>
                      <p className="text-sm text-muted-foreground leading-relaxed bg-muted/20 p-4 rounded-xl border border-border/30 whitespace-pre-wrap font-sans">
                        {selectedIssue.description || (language === "en" ? "No description provided." : "कोई विवरण प्रदान नहीं किया गया।")}
                      </p>
                    </div>

                    {/* Community Verification Action Panel */}
                    <div className="mb-6 p-4 rounded-xl border border-border/50 bg-muted/10">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-1.5">
                          <Shield className="w-4 h-4 text-primary" />
                          <h4 className="text-sm font-bold text-foreground">
                            {language === "en" ? "Community Verification" : "सामुदायिक सत्यापन"}
                          </h4>
                        </div>
                        {isVerified && (
                          <Badge className="bg-green-500/10 text-green-500 border-green-500/20 text-[10px] font-bold">
                            ✓ {language === "en" ? "Community Verified" : "सामुदायिक सत्यापित"}
                          </Badge>
                        )}
                      </div>

                      <div className="grid grid-cols-3 gap-3 text-center mb-4">
                        <div className="p-2 bg-muted/30 rounded-lg">
                          <p className="text-xs text-muted-foreground">{language === "en" ? "Confirmations" : "पुष्टि"}</p>
                          <p className="text-lg font-bold text-green-500">{confirmations}</p>
                        </div>
                        <div className="p-2 bg-muted/30 rounded-lg">
                          <p className="text-xs text-muted-foreground">{language === "en" ? "Disagreements" : "असहमतियां"}</p>
                          <p className="text-lg font-bold text-red-500">{disagreements}</p>
                        </div>
                        <div className="p-2 bg-muted/30 rounded-lg">
                          <p className="text-xs text-muted-foreground">{language === "en" ? "Confidence" : "विश्वास"}</p>
                          <p className="text-lg font-bold text-primary">{confidence}%</p>
                        </div>
                      </div>

                      {/* Vote Action Buttons */}
                      <div className="flex gap-2">
                        <Button
                          variant={userVote === "confirm" ? "default" : "outline"}
                          size="sm"
                          className="flex-1 gap-1.5 text-xs h-9 font-bold"
                          onClick={() => handleVote(selectedIssue.id, "confirm", selectedIssue.title)}
                          disabled={!!userVote}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {language === "en" ? "Confirm Issue" : "समस्या की पुष्टि करें"}
                        </Button>
                        <Button
                          variant={userVote === "disagree" ? "destructive" : "outline"}
                          size="sm"
                          className="flex-1 gap-1.5 text-xs h-9 font-bold"
                          onClick={() => handleVote(selectedIssue.id, "disagree", selectedIssue.title)}
                          disabled={!!userVote}
                        >
                          <X className="w-3.5 h-3.5" />
                          {language === "en" ? "Not an Issue" : "समस्या नहीं है"}
                        </Button>
                      </div>

                      {userVote && (
                        <p className="text-[10px] text-muted-foreground text-center mt-2.5 italic">
                          {language === "en" 
                            ? `You have already verified this issue as: ${userVote === "confirm" ? "Confirm Issue" : "Not an Issue"}.`
                            : `आपने पहले ही इस समस्या को सत्यापित किया है: ${userVote === "confirm" ? "पुष्टि करें" : "समस्या नहीं है"}.`
                          }
                        </p>
                      )}
                    </div>

                    {/* AI Intelligence Panel — only for authenticated users */}
                    {user && <AIInsightPanel issue={selectedIssue} />}

                    {/* Footer / Actions */}
                <div className="flex items-center justify-between pt-4 border-t border-border mt-5">
                  <div className="text-sm text-muted-foreground">
                    <span className="font-semibold text-foreground">{selectedIssue.supportsCount}</span>{" "}
                    {language === "en" ? "supports" : "समर्थन"}
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedIssue.latitude && selectedIssue.longitude && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-xs"
                        onClick={() => handleViewOnMap(selectedIssue.id)}
                      >
                        <Map className="w-3.5 h-3.5" />
                        {language === "en" ? "View on Map" : "मानचित्र"}
                      </Button>
                    )}
                    <Button 
                      variant={supportedIssues.has(selectedIssue.id) ? "default" : "outline"} 
                      size="sm" 
                      className="gap-2"
                      onClick={() => handleSupport(selectedIssue.id)}
                      disabled={supportingId === selectedIssue.id}
                    >
                      {supportingId === selectedIssue.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <ThumbsUp className={`w-4 h-4 ${supportedIssues.has(selectedIssue.id) ? "fill-current" : ""}`} />
                      )}
                      {supportedIssues.has(selectedIssue.id)
                        ? (language === "en" ? "Supported" : "समर्थित")
                        : (language === "en" ? "Support" : "समर्थन")}
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => {
                        searchParams.delete("issueId");
                        setSearchParams(searchParams);
                      }}
                    >
                      {language === "en" ? "Close" : "बंद करें"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()
      )}
    </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ 
  value, 
  label, 
  trend, 
  color,
  mapHref,
}: { 
  value: string; 
  label: string; 
  trend: string; 
  color: "primary" | "accent" | "warning" | "info";
  mapHref?: string;
}) {
  const navigate = useNavigate();
  const colorClasses = {
    primary: "bg-primary/10 text-primary",
    accent: "bg-accent/10 text-accent",
    warning: "bg-warning/10 text-warning",
    info: "bg-info/10 text-info",
  };

  return (
    <div
      className={`bg-card rounded-2xl p-5 border border-border shadow-card relative group ${
        mapHref ? "cursor-pointer hover:border-primary/40 hover:-translate-y-0.5 transition-all" : ""
      }`}
      onClick={mapHref ? () => navigate(mapHref) : undefined}
    >
      <p className={`text-3xl font-bold mb-1 ${colorClasses[color].split(" ")[1]}`}>{value}</p>
      <p className="text-sm font-medium text-foreground mb-1">{label}</p>
      <p className="text-xs text-muted-foreground">{trend}</p>
      {mapHref && (
        <Map className="absolute top-3 right-3 w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-primary transition-colors" />
      )}
    </div>
  );
}

function IssueCard({ 
  issue, 
  index,
  isSupported,
  isSupporting,
  onSupport,
  onViewDetails,
  onViewOnMap,
  getTimeAgo,
  activeLanguage,
}: { 
  issue: Issue; 
  index: number;
  isSupported: boolean;
  isSupporting: boolean;
  onSupport: () => void;
  onViewDetails: () => void;
  onViewOnMap?: () => void;
  getTimeAgo: (date: Date) => string;
  activeLanguage: "en" | "hi";
}) {
  const { t } = useLanguage();
  const config = statusConfig[issue.status] || statusConfig[IssueStatus.REPORTED];
  const categoryIcon = categoryIcons[issue.category] || <AlertTriangle className="w-4 h-4" />;
  const localizedStatusLabel = STATUS_LABELS[issue.status]?.[activeLanguage] || issue.status;

  const [verificationState, setVerificationState] = useState(() => 
    issueVerificationService.getComputedState(issue.id, issue.title)
  );

  useEffect(() => {
    const handleSync = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.issueId === issue.id) {
        setVerificationState(issueVerificationService.getComputedState(issue.id, issue.title));
      }
    };
    window.addEventListener("issue_verifications_changed", handleSync);
    return () => window.removeEventListener("issue_verifications_changed", handleSync);
  }, [issue.id, issue.title]);

  const { confirmations, disagreements, confidence, isVerified } = verificationState;

  return (
    <div 
      className="group bg-card rounded-2xl border border-border shadow-card hover:shadow-lg hover:-translate-y-1 transition-all overflow-hidden animate-slide-up cursor-pointer"
      style={{ animationDelay: `${index * 0.1}s` }}
      onClick={onViewDetails}
    >
      <div className="p-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-muted-foreground">
              {categoryIcon}
            </div>
            <div>
              <Badge variant="secondary" className="text-xs mb-1">
                {issue.category}
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isVerified && (
              <Badge className="bg-green-500/10 text-green-500 border-green-500/20 text-[10px] py-0.5 px-2 font-bold shrink-0">
                ✓ {activeLanguage === "en" ? "Verified" : "सत्यापित"}
              </Badge>
            )}
            <div className={`status-badge ${config.class}`}>
              {config.icon}
              {localizedStatusLabel}
            </div>
          </div>
        </div>

        {/* Content */}
        <h3 className="font-semibold text-foreground mb-1 group-hover:text-primary transition-colors line-clamp-2 text-left">
          {issue.title}
        </h3>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
          <span className="font-semibold text-foreground">{confidence}% {activeLanguage === "en" ? "Confidence" : "विश्वास"}</span>
          <span>({confirmations} vs {disagreements})</span>
        </div>

        {issue.location && (
          <p className="text-sm text-muted-foreground mb-4 flex items-center gap-1 text-left">
            <MapPin className="w-3 h-3 shrink-0" />
            <span className="truncate">{issue.location}</span>
          </p>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-border">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              {getTimeAgo(issue.createdAt)}
            </span>
            {onViewOnMap && (
              <button
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                onClick={(e) => { e.stopPropagation(); onViewOnMap(); }}
                title={activeLanguage === "en" ? "View on Map" : "मानचित्र पर देखें"}
              >
                <Map className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{activeLanguage === "en" ? "Map" : "मानचित्र"}</span>
              </button>
            )}
          </div>
          <Button 
            variant={isSupported ? "default" : "ghost"} 
            size="sm" 
            className={`gap-2 ${isSupported ? "" : "text-primary hover:text-primary"}`}
            onClick={(e) => {
              e.stopPropagation();
              onSupport();
            }}
            disabled={isSupporting}
          >
            {isSupporting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ThumbsUp className={`w-4 h-4 ${isSupported ? "fill-current" : ""}`} />
            )}
            {activeLanguage === "en" ? "Support" : "समर्थन"} ({issue.supportsCount})
          </Button>
        </div>
      </div>
    </div>
  );
}
