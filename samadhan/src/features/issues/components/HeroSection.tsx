import { Link } from "react-router-dom";
import { Button } from "@/shared/components/ui/button";
import { useLanguage } from "@/app/providers/LanguageProvider";
import { ROUTES } from "@/shared/config/routes";
import { 
  MapPin, 
  FileText, 
  Shield, 
  ArrowRight,
  CheckCircle2,
  Users,
  Clock,
  Trophy,
  FolderLock
} from "lucide-react";

export function HeroSection() {
  const { t, language } = useLanguage();

  const stats = [
    { value: "50K+", labelKey: "hero.issuesResolved", icon: CheckCircle2 },
    { value: "2.5L+", labelKey: "hero.activeCitizens", icon: Users },
    { value: "24hr", labelKey: "hero.avgResponse", icon: Clock },
  ];

  return (
    <section className="relative min-h-screen hero-gradient pt-24 pb-16 overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-[0.03]">
        <div className="absolute inset-0" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }} />
      </div>

      <div className="container mx-auto px-4 relative">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full text-primary text-sm font-medium mb-8 animate-fade-in">
            <Shield className="w-4 h-4" />
            <span>{t("hero.badge")}</span>
          </div>

          {/* Headline */}
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-foreground mb-6 animate-slide-up leading-tight">
            {t("hero.title1")}{" "}
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary-glow">{t("hero.title2")}</span>
            <br />
            {t("hero.title3")} <span className="text-secondary">Samadhan</span>
          </h1>

          {/* Subtitle */}
          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 animate-slide-up" style={{ animationDelay: "0.1s" }}>
            {t("hero.subtitle")}
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16 animate-slide-up" style={{ animationDelay: "0.2s" }}>
            <Link to={ROUTES.REPORT_ISSUE}>
              <Button variant="hero" className="group">
                <MapPin className="w-5 h-5" />
                {t("hero.reportIssue")}
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            <Link to={ROUTES.SCHEMES}>
              <Button variant="heroSecondary">
                <Shield className="w-5 h-5" />
                {t("hero.exploreSchemes")}
              </Button>
            </Link>
          </div>

          {/* Quick Action Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-5xl mx-auto mb-16">
            <QuickActionCard
              icon={<MapPin className="w-6 h-6" />}
              title={t("hero.issuesNearYou")}
              description={t("hero.issuesDesc")}
              href="/dashboard"
              delay="0.3s"
            />
            <QuickActionCard
              icon={<Shield className="w-6 h-6" />}
              title={t("hero.verifiedSchemes")}
              description={t("hero.schemesDesc")}
              href="/schemes"
              delay="0.4s"
            />
            <QuickActionCard
              icon={<Trophy className="w-6 h-6" />}
              title={language === "en" ? "Community Hero" : "सामुदायिक नायक"}
              description={
                language === "en"
                  ? "View your level, achievements, and community rank."
                  : "अपना स्तर, उपलब्धियां और सामुदायिक रैंक देखें।"
              }
              href="/profile"
              delay="0.5s"
            />
            <QuickActionCard
              icon={<FolderLock className="w-6 h-6" />}
              title={language === "en" ? "Smart Document Locker" : "स्मार्ट दस्तावेज़ लॉकर"}
              description={
                language === "en"
                  ? "Securely upload, verify, and manage your civic documents."
                  : "अपने नागरिक दस्तावेजों को सुरक्षित रूप से अपलोड, सत्यापित और प्रबंधित करें।"
              }
              href="/documents"
              delay="0.6s"
            />
          </div>

          {/* Stats */}
          <div className="flex flex-wrap items-center justify-center gap-8 sm:gap-16 animate-fade-in" style={{ animationDelay: "0.6s" }}>
            {stats.map((stat) => (
              <div key={stat.labelKey} className="text-center">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <stat.icon className="w-5 h-5 text-primary" />
                  <span className="text-3xl font-bold text-foreground">{stat.value}</span>
                </div>
                <p className="text-sm text-muted-foreground">{t(stat.labelKey)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Decorative Elements */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />
    </section>
  );
}

function QuickActionCard({ 
  icon, 
  title, 
  description, 
  href,
  delay 
}: { 
  icon: React.ReactNode; 
  title: string; 
  description: string; 
  href: string;
  delay: string;
}) {
  return (
    <Link
      to={href}
      className="group glass-card p-6 rounded-2xl text-left hover:shadow-xl hover:-translate-y-1 transition-all animate-slide-up flex flex-col justify-between"
      style={{ animationDelay: delay }}
    >
      <div>
        <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
          {icon}
        </div>
        <h3 className="font-semibold text-foreground mb-1 leading-snug">{title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
      </div>
    </Link>
  );
}
