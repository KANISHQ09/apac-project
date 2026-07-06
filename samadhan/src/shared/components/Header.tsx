import React, { useState, useEffect, forwardRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/shared/components/ui/button";
import { useLanguage } from "@/app/providers/LanguageProvider";
import { useAuth } from "@/features/auth";
import { ROUTES } from "@/shared/config/routes";
import { isFeatureEnabled, FeatureFlagName } from "@/shared/config/featureFlags";
import { 
  Menu, 
  X, 
  Globe, 
  Bell, 
  User,
  FileText,
  MapPin,
  Map,
  MessageSquare,
  Shield,
  FolderLock,
  LogIn,
  LogOut,
  Loader2
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { notificationService, AppNotification } from "@/shared/services/notificationService";
import { CommunityHeroWidget } from "@/features/profile/components/CommunityHeroWidget";

interface NavItem {
  labelKey: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  flag?: FeatureFlagName;
}

const navItems: NavItem[] = [
  { labelKey: "nav.dashboard", href: ROUTES.DASHBOARD, icon: MapPin },
  { labelKey: "nav.report", href: ROUTES.REPORT_ISSUE, icon: FileText },
  { labelKey: "nav.map", href: ROUTES.CIVIC_MAP, icon: Map, flag: "CIVIC_MAP" },
  { labelKey: "nav.schemes", href: ROUTES.SCHEMES, icon: Shield, flag: "SCHEMES_ENGINE" },
  { labelKey: "nav.analyzer", href: ROUTES.FORM_ANALYZER, icon: MessageSquare, flag: "FORM_ANALYZER" },
  { labelKey: "nav.documents", href: ROUTES.DOCUMENTS, icon: FolderLock, flag: "DOCUMENT_LOCKER" },
];

export const Header = forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>((props, ref) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { language, setLanguage, t } = useLanguage();
  const { user, loading, signOut } = useAuth();
  const location = useLocation();

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  useEffect(() => {
    const unsubscribe = notificationService.subscribe((list) => {
      setNotifications(list);
    });
    return () => unsubscribe();
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const toggleLanguage = () => {
    setLanguage(language === "en" ? "hi" : "en");
  };

  const isActive = (href: string) => location.pathname === href;

  const handleSignOut = async () => {
    await signOut();
  };

  const visibleNavItems = navItems.filter(
    (item) => !item.flag || isFeatureEnabled(item.flag)
  );

  return (
    <header ref={ref} className="fixed top-0 left-0 right-0 z-50 bg-card/80 backdrop-blur-xl border-b border-border" {...props}>
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to={ROUTES.HOME} className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl civic-gradient flex items-center justify-center shadow-md">
              <span className="text-primary-foreground font-bold text-lg">स</span>
            </div>
            <div className="hidden sm:block">
              <h1 className="font-bold text-lg text-foreground">Samadhan</h1>
              <p className="text-[10px] text-muted-foreground -mt-1">समाधान</p>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-1">
            {visibleNavItems.map((item) => (
              <Link
                key={item.labelKey}
                to={item.href}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  isActive(item.href)
                    ? "text-primary bg-primary/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <item.icon className="w-4 h-4" />
                {t(item.labelKey)}
              </Link>
            ))}
          </nav>

          {/* Right Actions */}
          <div className="flex items-center gap-2">
            {/* Language Toggle */}
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleLanguage}
              className="hidden sm:flex items-center gap-2"
            >
              <Globe className="w-4 h-4" />
              <span className="text-xs font-medium">
                {language === "en" ? "English" : "हिंदी"}
              </span>
            </Button>

            {/* Notifications Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="iconSm" className="relative">
                  <Bell className="w-4 h-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-secondary text-secondary-foreground text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
                      {unreadCount}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80 max-h-96 overflow-y-auto">
                <div className="px-3 py-2 font-semibold text-sm border-b border-border flex justify-between items-center">
                  <span>{language === "en" ? "Notifications" : "अधिसूचनाएं"}</span>
                  {unreadCount > 0 && (
                    <button 
                      onClick={() => notificationService.markAllAsRead()} 
                      className="text-xs text-primary hover:underline font-normal"
                    >
                      {language === "en" ? "Mark all read" : "सभी पढ़े हुए मानें"}
                    </button>
                  )}
                </div>
                {notifications.length === 0 ? (
                  <div className="py-6 text-center text-xs text-muted-foreground">
                    {language === "en" ? "No new alerts" : "कोई नई सूचनाएं नहीं"}
                  </div>
                ) : (
                  notifications.map((n) => (
                    <DropdownMenuItem 
                      key={n.id} 
                      onClick={() => notificationService.markAsRead(n.id)}
                      className={`flex flex-col items-start p-3 gap-1 border-b border-border last:border-b-0 cursor-pointer ${
                        !n.read ? "bg-muted/40 font-medium" : ""
                      }`}
                    >
                      <div className="flex justify-between w-full text-xs">
                        <span className={`font-bold ${
                          n.type === 'error' ? 'text-destructive' :
                          n.type === 'warning' ? 'text-warning' :
                          'text-primary'
                        }`}>
                          {n.title}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground text-left leading-normal">{n.message}</p>
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* User Menu or Sign In */}
            {loading ? (
              <Button variant="ghost" size="iconSm" disabled>
                <Loader2 className="w-4 h-4 animate-spin" />
              </Button>
            ) : user ? (
              <CommunityHeroWidget />
            ) : (
              <Link to={ROUTES.SIGN_IN}>
                <Button variant="outline" size="sm" className="hidden sm:flex gap-2">
                  <LogIn className="w-4 h-4" />
                  {t("nav.signin")}
                </Button>
              </Link>
            )}

            {/* Mobile Menu Toggle */}
            <Button
              variant="ghost"
              size="iconSm"
              className="lg:hidden"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              {isMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <nav className="lg:hidden py-4 border-t border-border animate-slide-up">
            <div className="flex flex-col gap-1">
              {visibleNavItems.map((item) => (
                <Link
                  key={item.labelKey}
                  to={item.href}
                  className={`flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                    isActive(item.href)
                      ? "text-primary bg-primary/10"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                  onClick={() => setIsMenuOpen(false)}
                >
                  <item.icon className="w-5 h-5" />
                  {t(item.labelKey)}
                </Link>
              ))}
              
              {/* Auth Links */}
              <div className="mt-2 pt-2 border-t border-border space-y-1">
                {user ? (
                  <>
                    <Link
                      to={ROUTES.PROFILE}
                      className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      <User className="w-5 h-5" />
                      {language === "en" ? "My Profile" : "मेरी प्रोफ़ाइल"}
                    </Link>
                    <Link
                      to={`${ROUTES.PROFILE}?tab=issues`}
                      className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      <FileText className="w-5 h-5" />
                      {language === "en" ? "My Issues" : "मेरी समस्याएं"}
                    </Link>
                    <Link
                      to={`${ROUTES.PROFILE}?tab=notifications`}
                      className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      <Bell className="w-5 h-5" />
                      {language === "en" ? "Notifications" : "अधिसूचनाएं"}
                    </Link>
                    <button
                      onClick={() => {
                        handleSignOut();
                        setIsMenuOpen(false);
                      }}
                      className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-destructive hover:bg-muted rounded-lg transition-colors w-full"
                    >
                      <LogOut className="w-5 h-5" />
                      {language === "en" ? "Sign Out" : "साइन आउट"}
                    </button>
                  </>
                ) : (
                  <>
                    <Link
                      to={ROUTES.SIGN_IN}
                      className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      <LogIn className="w-5 h-5" />
                      {t("nav.signin")}
                    </Link>
                    <Link
                      to={ROUTES.SIGN_UP}
                      className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-primary bg-primary/10 rounded-lg"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      <User className="w-5 h-5" />
                      {t("nav.signup")}
                    </Link>
                  </>
                )}
              </div>
              
              <div className="mt-2 pt-2 border-t border-border">
                <Button
                  variant="ghost"
                  onClick={toggleLanguage}
                  className="w-full justify-start gap-3"
                >
                  <Globe className="w-5 h-5" />
                  {language === "en" ? "English" : "हिंदी"}
                </Button>
              </div>
            </div>
          </nav>
        )}
      </div>
    </header>
  );
});

Header.displayName = "Header";
