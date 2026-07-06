import { Link } from "react-router-dom";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { useLanguage } from "@/app/providers/LanguageProvider";
import { ROUTES } from "@/shared/config/routes";
import { 
  MapPin, 
  ThumbsUp, 
  Clock, 
  ArrowRight,
  Droplets,
  Trash2,
  Zap,
  Construction,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  TreePine,
  Building2,
  Timer
} from "lucide-react";

type IssueStatus = "reported" | "in-progress" | "resolved";

interface Issue {
  id: string;
  titleEn: string;
  titleHi: string;
  category: string;
  categoryHi: string;
  locationEn: string;
  locationHi: string;
  distance: string;
  status: IssueStatus;
  supports: number;
  timeAgoEn: string;
  timeAgoHi: string;
}

const issues: Issue[] = [
  {
    id: "1",
    titleEn: "Broken water pipeline causing flooding",
    titleHi: "टूटी पानी की पाइपलाइन से बाढ़",
    category: "Water Supply",
    categoryHi: "जल आपूर्ति",
    locationEn: "Sector 21, Main Road",
    locationHi: "सेक्टर 21, मुख्य सड़क",
    distance: "0.5",
    status: "in-progress",
    supports: 156,
    timeAgoEn: "2 hours ago",
    timeAgoHi: "2 घंटे पहले",
  },
  {
    id: "2",
    titleEn: "Garbage not collected for 3 days",
    titleHi: "3 दिनों से कचरा नहीं उठाया गया",
    category: "Sanitation",
    categoryHi: "स्वच्छता",
    locationEn: "Green Park Colony",
    locationHi: "ग्रीन पार्क कॉलोनी",
    distance: "0.8",
    status: "reported",
    supports: 89,
    timeAgoEn: "5 hours ago",
    timeAgoHi: "5 घंटे पहले",
  },
  {
    id: "3",
    titleEn: "Street lights not working",
    titleHi: "स्ट्रीट लाइट्स काम नहीं कर रही हैं",
    category: "Electricity",
    categoryHi: "बिजली",
    locationEn: "Market Area, Block B",
    locationHi: "मार्केट एरिया, ब्लॉक बी",
    distance: "1.2",
    status: "resolved",
    supports: 234,
    timeAgoEn: "1 day ago",
    timeAgoHi: "1 दिन पहले",
  },
  {
    id: "4",
    titleEn: "Pothole on main highway causing accidents",
    titleHi: "मुख्य राजमार्ग पर गड्ढे से दुर्घटनाएं",
    category: "Roads",
    categoryHi: "सड़कें",
    locationEn: "NH-48 Junction",
    locationHi: "NH-48 जंक्शन",
    distance: "1.5",
    status: "in-progress",
    supports: 312,
    timeAgoEn: "3 days ago",
    timeAgoHi: "3 दिन पहले",
  },
];

const categoryIcons: Record<string, React.ReactNode> = {
  "Water Supply": <Droplets className="w-4 h-4" />,
  "Sanitation": <Trash2 className="w-4 h-4" />,
  "Electricity": <Zap className="w-4 h-4" />,
  "Roads": <Construction className="w-4 h-4" />,
};

export function IssuesNearYou() {
  const { t, language } = useLanguage();

  const statusConfig: Record<IssueStatus, { labelKey: string; class: string; icon: React.ReactNode }> = {
    reported: { 
      labelKey: "issues.reported", 
      class: "status-reported",
      icon: <AlertTriangle className="w-3 h-3" />
    },
    "in-progress": { 
      labelKey: "issues.inProgress", 
      class: "status-in-progress",
      icon: <Timer className="w-3 h-3" />
    },
    resolved: { 
      labelKey: "issues.resolved", 
      class: "status-resolved",
      icon: <CheckCircle2 className="w-3 h-3" />
    },
  };

  return (
    <section id="dashboard" className="py-20 bg-background">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary/10 rounded-full text-primary text-sm font-medium mb-4">
              <MapPin className="w-4 h-4" />
              {t("issues.badge")}
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-2">
              {t("issues.title")}
            </h2>
            <p className="text-muted-foreground">
              {t("issues.subtitle")}
            </p>
          </div>
          <Link to={ROUTES.REPORT_ISSUE}>
            <Button variant="outline" className="shrink-0">
              {t("issues.viewAll")}
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>

        {/* Stats Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
          <StatCard value="23" labelKey="issues.activeIssues" trend={language === "en" ? "+5 this week" : "+5 इस हफ्ते"} color="warning" />
          <StatCard value="156" labelKey="issues.resolved" trend={language === "en" ? "This month" : "इस महीने"} color="accent" />
          <StatCard value="18hrs" labelKey="issues.avgResponseTime" trend={language === "en" ? "↓ 2hrs faster" : "↓ 2 घंटे तेज"} color="info" />
          <StatCard value="1.2K" labelKey="issues.communitySupports" trend={language === "en" ? "+200 today" : "+200 आज"} color="primary" />
        </div>

        {/* Issues Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {issues.map((issue, index) => (
            <IssueCard 
              key={issue.id} 
              issue={issue} 
              index={index} 
              statusConfig={statusConfig}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function StatCard({ 
  value, 
  labelKey, 
  trend, 
  color 
}: { 
  value: string; 
  labelKey: string; 
  trend: string; 
  color: "primary" | "accent" | "warning" | "info";
}) {
  const { t } = useLanguage();
  const colorClasses = {
    primary: "bg-primary/10 text-primary",
    accent: "bg-accent/10 text-accent",
    warning: "bg-warning/10 text-warning",
    info: "bg-info/10 text-info",
  };

  return (
    <div className="bg-card rounded-2xl p-5 border border-border shadow-card">
      <p className={`text-3xl font-bold mb-1 ${colorClasses[color].split(" ")[1]}`}>{value}</p>
      <p className="text-sm font-medium text-foreground mb-1">{t(labelKey)}</p>
      <p className="text-xs text-muted-foreground">{trend}</p>
    </div>
  );
}

function IssueCard({ 
  issue, 
  index,
  statusConfig
}: { 
  issue: Issue; 
  index: number;
  statusConfig: Record<IssueStatus, { labelKey: string; class: string; icon: React.ReactNode }>;
}) {
  const { t, language } = useLanguage();
  const status = statusConfig[issue.status];
  const categoryIcon = categoryIcons[issue.category] || <AlertTriangle className="w-4 h-4" />;

  return (
    <div 
      className="group bg-card rounded-2xl border border-border shadow-card hover:shadow-lg hover:-translate-y-1 transition-all overflow-hidden animate-slide-up"
      style={{ animationDelay: `${index * 0.1}s` }}
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
                {language === "en" ? issue.category : issue.categoryHi}
              </Badge>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <MapPin className="w-3 h-3" />
                {issue.distance} km {t("issues.away")}
              </div>
            </div>
          </div>
          <div className={`status-badge ${status.class}`}>
            {status.icon}
            {t(status.labelKey)}
          </div>
        </div>

        {/* Content */}
        <h3 className="font-semibold text-foreground mb-2 group-hover:text-primary transition-colors">
          {language === "en" ? issue.titleEn : issue.titleHi}
        </h3>
        <p className="text-sm text-muted-foreground mb-4 flex items-center gap-1">
          <MapPin className="w-3 h-3" />
          {language === "en" ? issue.locationEn : issue.locationHi}
        </p>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-border">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              {language === "en" ? issue.timeAgoEn : issue.timeAgoHi}
            </span>
          </div>
          <Button variant="ghost" size="sm" className="gap-2 text-primary hover:text-primary">
            <ThumbsUp className="w-4 h-4" />
            {t("issues.support")} ({issue.supports})
          </Button>
        </div>
      </div>
    </div>
  );
}
