import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Award, Flame, Sparkles, User, Trophy, Compass, ShieldAlert, BadgeCheck } from "lucide-react";
import { useAuth } from "@/features/auth";
import { useLanguage } from "@/app/providers/LanguageProvider";
import { useToast } from "@/shared/hooks/use-toast";
import { issueRepository, issueService } from "@/features/issues";
import { profileService } from "@/features/profile/services/profileService";
import { gamificationService } from "@/features/profile/services/gamificationService";
import { Issue } from "@/shared/types/domain/Issue";
import { ROUTES } from "@/shared/config/routes";

// Map badge icons to Lucide components
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Award,
  Sparkles,
  Flame,
  User,
  Compass,
  ShieldAlert,
  BadgeCheck,
};

function CountingNumber({ value }: { value: number }) {
  const [displayValue, setDisplayValue] = useState(value);
  useEffect(() => {
    if (displayValue === value) return;
    const diff = value - displayValue;
    const step = diff > 0 ? Math.ceil(diff / 10) : Math.floor(diff / 10);
    const timer = setTimeout(() => {
      setDisplayValue((prev) => prev + step);
    }, 40);
    return () => clearTimeout(timer);
  }, [value, displayValue]);

  return <span>{displayValue}</span>;
}

export function CommunityHeroWidget() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const { toast } = useToast();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [supportedIssues, setSupportedIssues] = useState<Issue[]>([]);
  const [userProfile, setUserProfile] = useState<any>(null);
  
  const [shouldPulse, setShouldPulse] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [statsLoaded, setStatsLoaded] = useState(false);

  const prevProgressRef = useRef<any>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const refreshStats = async () => {
    if (!user) return;
    try {
      const rawIssues = await issueRepository.fetchUserIssues(user.id);
      setIssues(rawIssues.map((item) => issueService.mapResponseToDomain(item)));

      const rawSupported = await issueRepository.fetchUserSupportedIssues(user.id);
      setSupportedIssues(rawSupported.map((item) => issueService.mapResponseToDomain(item)));

      setStatsLoaded(true);

      profileService.getProfile(user.id)
        .then((prof) => setUserProfile(prof))
        .catch(() => {});
    } catch {}
  };

  useEffect(() => {
    if (user) {
      refreshStats();
      window.addEventListener("gamification_updated", refreshStats);
      return () => {
        window.removeEventListener("gamification_updated", refreshStats);
      };
    } else {
      setIssues([]);
      setSupportedIssues([]);
      setUserProfile(null);
      setStatsLoaded(false);
    }
  }, [user]);

  const progress = gamificationService.computeProgress(issues, supportedIssues);

  // Monitor stats changes for Toast triggers and Pulse animations
  useEffect(() => {
    if (!progress || !statsLoaded) {
      return;
    }

    if (!prevProgressRef.current) {
      prevProgressRef.current = progress;
      return;
    }

    const prev = prevProgressRef.current;
    let didUpdate = false;

    // 1. Level up toast & pulse
    if (progress.level > prev.level) {
      didUpdate = true;
      toast({
        title: language === "en" ? "⭐ Level Up!" : "⭐ स्तर बढ़ा!",
        description: language === "en"
          ? `You reached Level ${progress.level}! (${progress.rank})`
          : `आप स्तर ${progress.level} पर पहुँच गए हैं! (${progress.rank})`,
      });
    }

    // 2. Achievements toast & pulse
    const newlyUnlocked = progress.achievements.filter(
      (ach) => ach.unlocked && !prev.achievements.find((p: any) => p.id === ach.id)
    );

    if (newlyUnlocked.length > 0) {
      didUpdate = true;
      newlyUnlocked.forEach((ach) => {
        toast({
          title: language === "en" ? "🏅 Achievement Unlocked" : "🏅 उपलब्धि अनलॉक",
          description: `${ach.title} (+${ach.xpValue} XP)`,
        });
      });
    }

    // Update ref for next comparison BEFORE returning due to update animation states
    prevProgressRef.current = progress;

    if (didUpdate) {
      setShouldPulse(true);
      const timer = setTimeout(() => setShouldPulse(false), 800);
      return () => clearTimeout(timer);
    }
  }, [progress, statsLoaded, toast, language]);

  const handleMouseEnter = () => {
    if (window.innerWidth < 1024) return;
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    if (window.innerWidth < 1024) return;
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHovered(false);
    }, 150);
  };

  const handleTriggerClick = (e: React.MouseEvent) => {
    if (window.innerWidth < 1024) {
      e.preventDefault();
      setIsMobileOpen(!isMobileOpen);
    }
  };

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        setIsMobileOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  if (!user || !progress) return null;

  const unlockedBadges = progress.achievements.filter((a) => a.unlocked).slice(0, 4);

  const getStreakText = (dateStr: string | null) => {
    if (!dateStr) return language === "en" ? "No contributions yet" : "कोई योगदान नहीं";
    const today = new Date().toLocaleDateString();
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toLocaleDateString();
    if (dateStr === today) return language === "en" ? "Today" : "आज";
    if (dateStr === yesterday) return language === "en" ? "Yesterday" : "कल";
    return dateStr;
  };

  const showCard = isHovered || isMobileOpen;

  return (
    <div
      ref={cardRef}
      className="relative flex items-center"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Trigger Link */}
      <Link
        to={ROUTES.PROFILE}
        onClick={handleTriggerClick}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all duration-500 relative select-none ${
          shouldPulse
            ? "scale-110 bg-primary/20 border-primary shadow-[0_0_15px_rgba(var(--primary-rgb),0.5)] rotate-2"
            : "border-border hover:bg-muted"
        }`}
      >
        {shouldPulse && (
          <>
            <Sparkles className="absolute -top-3 -right-3 w-5 h-5 text-amber-500 animate-bounce" />
            <Sparkles className="absolute -bottom-3 -left-3 w-4 h-4 text-amber-500 animate-bounce" />
          </>
        )}
        <Award className={`w-4 h-4 text-primary ${shouldPulse ? "animate-spin" : ""}`} />
        <span className="text-xs font-bold text-foreground">
          Lv.{progress.level}
        </span>
        <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center overflow-hidden">
          <User className="w-3.5 h-3.5" />
        </div>
      </Link>

      {/* Hover Card / Popover */}
      {showCard && (
        <div
          className="absolute right-0 top-full mt-2 w-80 bg-card border border-border rounded-2xl shadow-2xl p-5 z-50 text-left animate-in fade-in slide-in-from-top-2 duration-200"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {/* Header */}
          <div className="flex items-start gap-3.5 mb-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Trophy className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h4 className="font-bold text-foreground truncate text-sm">
                {userProfile?.fullName || user.email?.split("@")[0] || "Citizen"}
              </h4>
              <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mt-0.5">
                {progress.rank}
              </p>
            </div>
          </div>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 gap-2.5 mb-4 text-xs">
            <div className="bg-muted/30 p-2 rounded-xl border border-border/20">
              <p className="text-muted-foreground text-[9px] uppercase font-bold tracking-wider">
                {language === "en" ? "Impact Score" : "प्रभाव स्कोर"}
              </p>
              <p className="text-sm font-bold text-foreground">
                <CountingNumber value={progress.impactScore} /> pts
              </p>
            </div>
            <div className="bg-muted/30 p-2 rounded-xl border border-border/20">
              <p className="text-muted-foreground text-[9px] uppercase font-bold tracking-wider">
                {language === "en" ? "Streak" : "सक्रियता"}
              </p>
              <div className="flex items-center gap-1">
                <Flame className="w-3.5 h-3.5 text-amber-500 fill-amber-500 animate-pulse" />
                <p className="text-sm font-bold text-foreground">
                  {progress.streakCount} {language === "en" ? "Wk" : "सप्ताह"}
                </p>
              </div>
            </div>
          </div>

          {/* XP Progress Bar */}
          <div className="space-y-1.5 mb-4">
            <div className="flex items-center justify-between text-[10px] font-semibold">
              <span className="text-muted-foreground">
                {language === "en" ? `Level ${progress.level}` : `स्तर ${progress.level}`}
              </span>
              <span className="text-foreground">
                {progress.currentLevelXp} / {progress.nextLevelXp} XP
              </span>
            </div>
            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: `${progress.xpProgressPercent}%` }}
              />
            </div>
            <p className="text-[9px] text-muted-foreground text-right">
              {language === "en"
                ? `Last Contribution: ${getStreakText(progress.lastContributionDate)}`
                : `अंतिम योगदान: ${getStreakText(progress.lastContributionDate)}`}
            </p>
          </div>

          {/* Detailed Contribution Breakdown */}
          <div className="border-t border-border/40 py-3 flex items-center justify-between text-[10px] text-muted-foreground">
            <div className="text-center">
              <p className="font-bold text-foreground text-xs">{progress.reportedCount}</p>
              <p>{language === "en" ? "Reports" : "दर्ज"}</p>
            </div>
            <div className="h-6 w-px bg-border/40" />
            <div className="text-center">
              <p className="font-bold text-foreground text-xs">{progress.supportedCount}</p>
              <p>{language === "en" ? "Supports" : "समर्थन"}</p>
            </div>
            <div className="h-6 w-px bg-border/40" />
            <div className="text-center">
              <p className="font-bold text-foreground text-xs">{progress.verificationsCount}</p>
              <p>{language === "en" ? "Verified" : "सत्यापन"}</p>
            </div>
          </div>

          {/* Recently Unlocked Achievements */}
          {unlockedBadges.length > 0 && (
            <div className="border-t border-border/40 pt-3 mb-4">
              <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-2">
                {language === "en" ? "Recent Badges" : "हाल के बैज"}
              </p>
              <div className="flex gap-2.5">
                {unlockedBadges.map((ach) => {
                  const Icon = iconMap[ach.iconName] || Award;
                  return (
                    <div
                      key={ach.id}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center border relative group/item cursor-help ${ach.color}`}
                    >
                      <Icon className="w-4 h-4" />
                      {/* Sub-tooltip */}
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-32 bg-card border border-border rounded-md p-1.5 shadow-xl opacity-0 scale-95 pointer-events-none group-hover/item:opacity-100 group-hover/item:scale-100 transition-all duration-200 z-50 text-[9px] leading-tight">
                        <p className="font-bold text-foreground">{ach.title}</p>
                        <p className="text-muted-foreground mt-0.5">{ach.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* CTA Link */}
          <Link
            to={ROUTES.PROFILE}
            className="w-full inline-flex items-center justify-center px-4 py-2 bg-primary text-primary-foreground text-xs font-bold rounded-xl hover:bg-primary/95 transition-all shadow-md mt-2"
            onClick={() => setIsMobileOpen(false)}
          >
            {language === "en" ? "Community Hero Dashboard →" : "कम्युनिटी हीरो डैशबोर्ड →"}
          </Link>
        </div>
      )}
    </div>
  );
}
