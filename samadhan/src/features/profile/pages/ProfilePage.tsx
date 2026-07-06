import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useLanguage } from "@/app/providers/LanguageProvider";
import { useAuth } from "@/features/auth";
import { useProfileData } from "../hooks/useProfileData";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { Badge } from "@/shared/components/ui/badge";
import { STATUS_LABELS } from "@/shared/constants/statuses";
import { IssueStatus } from "@/shared/types/domain/IssueStatus";
import { ROUTES } from "@/shared/config/routes";
import { LoadingState } from "@/shared/components/LoadingState";
import { EmptyState } from "@/shared/components/EmptyState";
import {
  User,
  FileText,
  Bell,
  MapPin,
  Phone,
  Mail,
  Home,
  Save,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Timer,
  Clock,
  LogOut,
  Heart,
  Flag,
  Construction,
  Droplets,
  Trash2,
  TrendingUp,
  Shield,
  Flame,
  Sparkles,
  Award,
  Medal
} from "lucide-react";
import { gamificationService } from "../services/gamificationService";

const statusConfig: Record<string, { class: string; icon: React.ReactNode }> = {
  [IssueStatus.REPORTED]: { 
    class: "bg-warning/15 text-warning",
    icon: <AlertTriangle className="w-3 h-3" />
  },
  [IssueStatus.IN_PROGRESS]: { 
    class: "bg-info/15 text-info",
    icon: <Timer className="w-3 h-3" />
  },
  [IssueStatus.RESOLVED]: { 
    class: "bg-accent/15 text-accent",
    icon: <CheckCircle2 className="w-3 h-3" />
  },
  [IssueStatus.REJECTED]: { 
    class: "bg-destructive/15 text-destructive",
    icon: <AlertTriangle className="w-3 h-3" />
  },
};

const iconMap: Record<string, React.ComponentType<any>> = {
  Flag,
  Heart,
  Construction,
  Droplets,
  Trash2,
  CheckCircle2,
  TrendingUp,
  Shield,
};

export default function ProfilePage() {
  const { user, signOut } = useAuth();
  const { language } = useLanguage();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab = searchParams.get("tab") || "profile";

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value });
  };

  const [subTab, setSubTab] = useState<"reported" | "supported">("reported");

  const {
    profile,
    setProfile,
    issues,
    supportedIssues,
    notifications,
    loading,
    saving,
    handleProfileUpdate,
    handleNotificationUpdate,
  } = useProfileData(user, language);

  const gamificationState = gamificationService.computeProgress(issues, supportedIssues);
  const leaderboard = gamificationService.getDemoLeaderboard(
    gamificationState,
    profile?.fullName || user?.email || ""
  );

  const handleSignOut = async () => {
    await signOut();
    navigate(ROUTES.LANDING);
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <LoadingState message={language === "en" ? "Loading profile..." : "प्रोफ़ाइल लोड हो रही है..."} />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">
              {language === "en" ? "My Profile" : "मेरी प्रोफ़ाइल"}
            </h1>
            <p className="text-muted-foreground">
              {user?.email}
            </p>
          </div>
          <Button variant="outline" onClick={handleSignOut} className="gap-2">
            <LogOut className="w-4 h-4" />
            {language === "en" ? "Sign Out" : "साइन आउट"}
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Main content tabs (Left side) */}
          <div className="lg:col-span-8">
            <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="profile" className="gap-2">
                  <User className="w-4 h-4" />
                  <span className="hidden sm:inline">
                    {language === "en" ? "Profile" : "प्रोफ़ाइल"}
                  </span>
                </TabsTrigger>
                <TabsTrigger value="issues" className="gap-2">
                  <FileText className="w-4 h-4" />
                  <span className="hidden sm:inline">
                    {language === "en" ? "My Issues" : "मेरी समस्याएं"}
                  </span>
                </TabsTrigger>
                <TabsTrigger value="notifications" className="gap-2">
                  <Bell className="w-4 h-4" />
                  <span className="hidden sm:inline">
                    {language === "en" ? "Notifications" : "अधिसूचनाएं"}
                  </span>
                </TabsTrigger>
              </TabsList>

              {/* Profile Tab */}
              <TabsContent value="profile">
                <div className="bg-card rounded-2xl border border-border p-6 shadow-card">
                  <form onSubmit={handleProfileUpdate} className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="fullName">
                          {language === "en" ? "Full Name" : "पूरा नाम"}
                        </Label>
                        <div className="relative">
                          <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input
                            id="fullName"
                            value={profile?.fullName || ""}
                            onChange={(e) => setProfile(p => p ? {...p, fullName: e.target.value} : null)}
                            className="pl-10"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="phone">
                          {language === "en" ? "Phone Number" : "फ़ोन नंबर"}
                        </Label>
                        <div className="relative">
                          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input
                            id="phone"
                            value={profile?.phone || ""}
                            onChange={(e) => setProfile(p => p ? {...p, phone: e.target.value} : null)}
                            className="pl-10"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="address">
                        {language === "en" ? "Address" : "पता"}
                      </Label>
                      <div className="relative">
                        <Home className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="address"
                          value={profile?.address || ""}
                          onChange={(e) => setProfile(p => p ? {...p, address: e.target.value} : null)}
                          className="pl-10"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="city">
                          {language === "en" ? "City" : "शहर"}
                        </Label>
                        <Input
                          id="city"
                          value={profile?.city || ""}
                          onChange={(e) => setProfile(p => p ? {...p, city: e.target.value} : null)}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="state">
                          {language === "en" ? "State" : "राज्य"}
                        </Label>
                        <Input
                          id="state"
                          value={profile?.state || ""}
                          onChange={(e) => setProfile(p => p ? {...p, state: e.target.value} : null)}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="pincode">
                          {language === "en" ? "Pincode" : "पिनकोड"}
                        </Label>
                        <Input
                          id="pincode"
                          value={profile?.pincode || ""}
                          onChange={(e) => setProfile(p => p ? {...p, pincode: e.target.value} : null)}
                        />
                      </div>
                    </div>

                    <Button type="submit" disabled={saving} className="gap-2">
                      {saving ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          {language === "en" ? "Saving..." : "सहेजा जा रहा है..."}
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4" />
                          {language === "en" ? "Save Changes" : "बदलाव सहेजें"}
                        </>
                      )}
                    </Button>
                  </form>
                </div>
              </TabsContent>

              {/* Issues Tab */}
              <TabsContent value="issues">
                <div className="bg-card rounded-2xl border border-border p-6 shadow-card">
                  {/* Sub-tabs / Pills for Reported vs Supported */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-border pb-4 mb-6 gap-4">
                    <div className="flex bg-muted p-1 rounded-xl w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={() => setSubTab("reported")}
                        className={`flex-1 sm:flex-none px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                          subTab === "reported"
                            ? "bg-card text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {language === "en" ? `Reported (${issues.length})` : `दर्ज की गई (${issues.length})`}
                      </button>
                      <button
                        type="button"
                        onClick={() => setSubTab("supported")}
                        className={`flex-1 sm:flex-none px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                          subTab === "supported"
                            ? "bg-card text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {language === "en" ? `Supported (${supportedIssues.length})` : `समर्थित (${supportedIssues.length})`}
                      </button>
                    </div>
                    <Button size="sm" onClick={() => navigate(ROUTES.REPORT_ISSUE)} className="w-full sm:w-auto">
                      {language === "en" ? "Report New" : "नई रिपोर्ट"}
                    </Button>
                  </div>

                  {subTab === "reported" ? (
                    issues.length === 0 ? (
                      <EmptyState
                        title={language === "en" ? "No Issues Reported" : "कोई समस्या दर्ज नहीं"}
                        description={
                          language === "en" 
                            ? "You haven't reported any civic issues yet." 
                            : "आपने अभी तक कोई नागरिक समस्या दर्ज नहीं की है।"
                        }
                        actionText={language === "en" ? "Report an Issue" : "समस्या दर्ज करें"}
                        onAction={() => navigate(ROUTES.REPORT_ISSUE)}
                      />
                    ) : (
                      <div className="space-y-4">
                        {issues.map((issue) => {
                          const status = statusConfig[issue.status] || statusConfig[IssueStatus.REPORTED];
                          const localizedLabel = STATUS_LABELS[issue.status]?.[language] || issue.status;
                          return (
                            <div 
                              key={issue.id}
                              className="p-4 bg-muted/50 rounded-xl hover:bg-muted transition-colors cursor-pointer"
                              onClick={() => navigate(`${ROUTES.DASHBOARD}?issueId=${issue.id}`)}
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 text-left">
                                  <div className="flex items-center gap-2 mb-2">
                                    <Badge variant="secondary" className="text-xs">
                                      {issue.category}
                                    </Badge>
                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${status.class}`}>
                                      {status.icon}
                                      {localizedLabel}
                                    </span>
                                  </div>
                                  <h4 className="font-medium text-foreground mb-1">
                                    {issue.title}
                                  </h4>
                                  {issue.location && (
                                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                                      <MapPin className="w-3 h-3" />
                                      {issue.location}
                                    </p>
                                  )}
                                </div>
                                <div className="text-right text-sm text-muted-foreground shrink-0">
                                  <div className="flex items-center gap-1 justify-end">
                                    <Clock className="w-3 h-3" />
                                    {new Date(issue.createdAt).toLocaleDateString()}
                                  </div>
                                  <p className="text-xs mt-1">
                                    {issue.supportsCount} {language === "en" ? "supports" : "समर्थन"}
                                  </p>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )
                  ) : (
                    supportedIssues.length === 0 ? (
                      <EmptyState
                        title={language === "en" ? "No Supported Issues" : "कोई समर्थित समस्या नहीं"}
                        description={
                          language === "en" 
                            ? "You haven't supported or upvoted any issues yet." 
                            : "आपने अभी तक किसी समस्या का समर्थन या वोट नहीं किया है।"
                        }
                        actionText={language === "en" ? "Browse Issues" : "समस्याएं देखें"}
                        onAction={() => navigate(ROUTES.DASHBOARD)}
                      />
                    ) : (
                      <div className="space-y-4">
                        {supportedIssues.map((issue) => {
                          const status = statusConfig[issue.status] || statusConfig[IssueStatus.REPORTED];
                          const localizedLabel = STATUS_LABELS[issue.status]?.[language] || issue.status;
                          return (
                            <div 
                              key={issue.id}
                              className="p-4 bg-muted/50 rounded-xl hover:bg-muted transition-colors cursor-pointer"
                              onClick={() => navigate(`${ROUTES.DASHBOARD}?issueId=${issue.id}`)}
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 text-left">
                                  <div className="flex items-center gap-2 mb-2">
                                    <Badge variant="secondary" className="text-xs">
                                      {issue.category}
                                    </Badge>
                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${status.class}`}>
                                      {status.icon}
                                      {localizedLabel}
                                    </span>
                                  </div>
                                  <h4 className="font-medium text-foreground mb-1">
                                    {issue.title}
                                  </h4>
                                  {issue.location && (
                                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                                      <MapPin className="w-3 h-3" />
                                      {issue.location}
                                    </p>
                                  )}
                                </div>
                                <div className="text-right text-sm text-muted-foreground shrink-0">
                                  <div className="flex items-center gap-1 justify-end">
                                    <Clock className="w-3 h-3" />
                                    {new Date(issue.createdAt).toLocaleDateString()}
                                  </div>
                                  <p className="text-xs mt-1">
                                    {issue.supportsCount} {language === "en" ? "supports" : "समर्थन"}
                                  </p>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )
                  )}
                </div>
              </TabsContent>

              {/* Notifications Tab */}
              <TabsContent value="notifications">
                <div className="bg-card rounded-2xl border border-border p-6 space-y-6 shadow-card">
                  <div>
                    <h3 className="font-semibold text-foreground mb-4 text-left">
                      {language === "en" ? "Notification Channels" : "अधिसूचना चैनल"}
                    </h3>
                    <div className="space-y-4">
                      <NotificationToggle
                        label={language === "en" ? "Email Notifications" : "ईमेल अधिसूचनाएं"}
                        description={language === "en" ? "Receive updates via email" : "ईमेल द्वारा अपडेट प्राप्त करें"}
                        checked={notifications?.email_notifications || false}
                        onCheckedChange={(v) => handleNotificationUpdate("email_notifications", v)}
                        icon={<Mail className="w-5 h-5" />}
                      />
                      <NotificationToggle
                        label={language === "en" ? "SMS Notifications" : "SMS अधिसूचनाएं"}
                        description={language === "en" ? "Receive updates via SMS" : "SMS द्वारा अपडेट प्राप्त करें"}
                        checked={notifications?.sms_notifications || false}
                        onCheckedChange={(v) => handleNotificationUpdate("sms_notifications", v)}
                        icon={<Phone className="w-5 h-5" />}
                      />
                      <NotificationToggle
                        label={language === "en" ? "Push Notifications" : "पुश अधिसूचनाएं"}
                        description={language === "en" ? "Receive push notifications in browser" : "ब्राउज़र में पुश अधिसूचनाएं प्राप्त करें"}
                        checked={notifications?.push_notifications || false}
                        onCheckedChange={(v) => handleNotificationUpdate("push_notifications", v)}
                        icon={<Bell className="w-5 h-5" />}
                      />
                    </div>
                  </div>

                  <div className="border-t border-border pt-6">
                    <h3 className="font-semibold text-foreground mb-4 text-left">
                      {language === "en" ? "Notification Types" : "अधिसूचना प्रकार"}
                    </h3>
                    <div className="space-y-4">
                      <NotificationToggle
                        label={language === "en" ? "Issue Updates" : "समस्या अपडेट"}
                        description={language === "en" ? "Get notified when your issues are updated" : "जब आपकी समस्याएं अपडेट हों तो सूचित करें"}
                        checked={notifications?.issue_updates || false}
                        onCheckedChange={(v) => handleNotificationUpdate("issue_updates", v)}
                      />
                      <NotificationToggle
                        label={language === "en" ? "Scheme Alerts" : "योजना अलर्ट"}
                        description={language === "en" ? "New schemes matching your profile" : "आपकी प्रोफ़ाइल से मेल खाती नई योजनाएं"}
                        checked={notifications?.scheme_alerts || false}
                        onCheckedChange={(v) => handleNotificationUpdate("scheme_alerts", v)}
                      />
                      <NotificationToggle
                        label={language === "en" ? "Document Reminders" : "दस्तावेज़ अनुस्मारक"}
                        description={language === "en" ? "Expiry and renewal reminders" : "समाप्ति और नवीनीकरण अनुस्मारक"}
                        checked={notifications?.document_reminders || false}
                        onCheckedChange={(v) => handleNotificationUpdate("document_reminders", v)}
                      />
                      <NotificationToggle
                        label={language === "en" ? "Weekly Digest" : "साप्ताहिक सारांश"}
                        description={language === "en" ? "Weekly summary of activity in your area" : "आपके क्षेत्र में गतिविधि का साप्ताहिक सारांश"}
                        checked={notifications?.weekly_digest || false}
                        onCheckedChange={(v) => handleNotificationUpdate("weekly_digest", v)}
                      />
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          {/* Community Hero Side Panel (Right Column) */}
          <div className="lg:col-span-4 space-y-6">
            {/* Community Hero Stats Card */}
            <div className="bg-card rounded-2xl border border-border shadow-card p-6 relative overflow-hidden bg-gradient-to-br from-card via-card to-primary/5 text-left">
              <div className="absolute top-0 right-0 w-24 h-24 bg-primary/10 rounded-full blur-2xl animate-pulse" />
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                  <Award className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-bold text-foreground text-sm uppercase tracking-wider">
                    {language === "en" ? "Community Hero" : "सामुदायिक नायक"}
                  </h3>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20 mt-0.5">
                    {gamificationState.rank}
                  </span>
                </div>
              </div>

              {/* Weekly Streak Indicator */}
              <div className="flex items-center gap-2 mb-5 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                <Flame className="w-4 h-4 text-amber-500 fill-amber-500 animate-pulse" />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-amber-500">
                    {language === "en"
                      ? `${gamificationState.streakCount} Week Streak`
                      : `${gamificationState.streakCount} सप्ताह की निरंतरता`}
                  </p>
                  {gamificationState.lastContributionDate && (
                    <p className="text-[9px] text-muted-foreground truncate">
                      {language === "en" ? "Last activity: " : "अंतिम गतिविधि: "}
                      {gamificationState.lastContributionDate}
                    </p>
                  )}
                </div>
              </div>

              {/* XP Progress */}
              <div className="space-y-2 mb-5">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-muted-foreground">
                    {language === "en" ? `Level ${gamificationState.level}` : `स्तर ${gamificationState.level}`}
                  </span>
                  <span className="text-foreground">
                    {gamificationState.currentLevelXp} / {gamificationState.nextLevelXp} XP
                  </span>
                </div>
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-500"
                    style={{ width: `${gamificationState.xpProgressPercent}%` }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground text-right">
                  {language === "en"
                    ? `${gamificationState.nextLevelXp - gamificationState.currentLevelXp} XP to next level`
                    : `अगले स्तर के लिए ${gamificationState.nextLevelXp - gamificationState.currentLevelXp} XP`}
                </p>
              </div>

              {/* Grid of stats */}
              <div className="grid grid-cols-2 gap-3 pt-4 border-t border-border/40 text-xs">
                <div className="bg-muted/10 p-2.5 rounded-xl border border-border/30">
                  <p className="text-muted-foreground text-[10px] uppercase font-bold tracking-wider mb-0.5">
                    {language === "en" ? "Impact Score" : "प्रभाव स्कोर"}
                  </p>
                  <p className="text-lg font-bold text-foreground">{gamificationState.impactScore}</p>
                </div>
                <div className="bg-muted/10 p-2.5 rounded-xl border border-border/30">
                  <p className="text-muted-foreground text-[10px] uppercase font-bold tracking-wider mb-0.5">
                    {language === "en" ? "Verifications" : "सत्यापन"}
                  </p>
                  <p className="text-lg font-bold text-foreground">{gamificationState.verificationsCount}</p>
                </div>
                <div className="bg-muted/10 p-2.5 rounded-xl border border-border/30">
                  <p className="text-muted-foreground text-[10px] uppercase font-bold tracking-wider mb-0.5">
                    {language === "en" ? "Reported" : "दर्ज मामले"}
                  </p>
                  <p className="text-lg font-bold text-foreground">{gamificationState.reportedCount}</p>
                </div>
                <div className="bg-muted/10 p-2.5 rounded-xl border border-border/30">
                  <p className="text-muted-foreground text-[10px] uppercase font-bold tracking-wider mb-0.5">
                    {language === "en" ? "Resolved" : "समाधान"}
                  </p>
                  <p className="text-lg font-bold text-foreground">{gamificationState.resolvedCount}</p>
                </div>
              </div>
            </div>

            {/* Achievements Grid */}
            <div className="bg-card rounded-2xl border border-border shadow-card p-5 text-left">
              <div className="flex items-center gap-2 mb-3.5">
                <Sparkles className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">
                  {language === "en" ? "Achievements & Badges" : "उपलब्धियां और बैज"}
                </h3>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {gamificationState.achievements.map((ach) => {
                  const IconComponent = iconMap[ach.iconName] || Award;
                  return (
                    <div
                      key={ach.id}
                      className={`flex flex-col items-center justify-center p-2 rounded-xl border transition-all duration-300 relative group cursor-help ${
                        ach.unlocked
                          ? `${ach.color}`
                          : "opacity-35 bg-muted/20 border-border/20 text-muted-foreground"
                      }`}
                    >
                      <IconComponent className="w-5 h-5 mb-1" />
                      <span className="text-[9px] font-bold text-center truncate w-full">
                        {ach.title}
                      </span>
                      
                      {/* Tooltip */}
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-card border border-border rounded-lg p-2.5 shadow-2xl opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 transition-all duration-200 z-50 text-xs">
                        <p className="font-bold text-foreground">{ach.title}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5 leading-normal">
                          {ach.description}
                        </p>
                        <div className="flex items-center justify-between mt-2 pt-1 border-t border-border/30 text-[9px]">
                          <span className={`font-semibold ${ach.unlocked ? "text-green-500" : "text-amber-500"}`}>
                            {ach.unlocked 
                              ? (language === "en" ? "✓ Unlocked" : "✓ अनलॉक")
                              : (language === "en" ? "✕ Locked" : "✕ लॉक")
                            }
                          </span>
                          <span className="text-primary font-bold">+{ach.xpValue} XP</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Demo Leaderboard */}
            <div className="bg-card rounded-2xl border border-border shadow-card p-5 text-left">
              <div className="flex items-center gap-2 mb-3.5">
                <Medal className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">
                  {language === "en" ? "Demo Community Leaderboard" : "डेमो सामुदायिक लीडरबोर्ड"}
                </h3>
              </div>
              <div className="space-y-2.5">
                {leaderboard.map((entry) => (
                  <div
                    key={entry.name}
                    className={`flex items-center justify-between p-2.5 rounded-xl border text-xs transition-colors ${
                      entry.isCurrentUser
                        ? "bg-primary/10 border-primary/20"
                        : "border-border/10 bg-muted/5"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                        entry.rank === 1
                          ? "bg-yellow-500/20 text-yellow-500"
                          : entry.rank === 2
                          ? "bg-slate-400/20 text-slate-400"
                          : entry.rank === 3
                          ? "bg-amber-600/20 text-amber-600"
                          : "bg-muted text-muted-foreground"
                      }`}>
                        {entry.rank}
                      </span>
                      <span className={`font-medium truncate ${entry.isCurrentUser ? "font-bold text-foreground" : "text-muted-foreground"}`}>
                        {entry.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[10px] text-muted-foreground">
                        Lv.{entry.level}
                      </span>
                      <span className="font-bold text-foreground">
                        {entry.impactScore} pts
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function NotificationToggle({
  label,
  description,
  checked,
  onCheckedChange,
  icon,
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between p-4 bg-muted/50 rounded-xl hover:bg-muted/70 transition-all">
      <div className="flex items-center gap-3">
        {icon && (
          <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            {icon}
          </div>
        )}
        <div>
          <p className="font-medium text-foreground">{label}</p>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
