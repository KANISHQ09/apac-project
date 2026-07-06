import { useState } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { useToast } from "@/shared/hooks/use-toast";
import { useLanguage } from "@/app/providers/LanguageProvider";
import { authService } from "../services/authService";
import { loginSchema } from "../validation/loginSchema";
import { signupSchema } from "../validation/signupSchema";
import { ROUTES } from "@/shared/config/routes";
import { 
  Shield, 
  Mail, 
  Lock, 
  User, 
  Eye, 
  EyeOff,
  Loader2,
  ArrowLeft,
  Globe
} from "lucide-react";
import { logger } from "@/shared/services/logger";

export function AuthForm() {
  const location = useLocation();
  const isSignUp = location.pathname === ROUTES.SIGN_UP;
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t, language, setLanguage } = useLanguage();
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const toggleLanguage = () => {
    setLanguage(language === "en" ? "hi" : "en");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (isSignUp) {
        // Validate signup Zod schema
        const validation = signupSchema.safeParse({
          fullName,
          email,
          password,
          confirmPassword,
        });

        if (!validation.success) {
          const firstErr = validation.error.errors[0]?.message || "Validation failed";
          toast({
            title: language === "en" ? "Error" : "त्रुटि",
            description: firstErr,
            variant: "destructive",
          });
          setIsLoading(false);
          return;
        }

        await authService.signUp({
          fullName: validation.data.fullName,
          email: validation.data.email,
          password: validation.data.password,
          confirmPassword: validation.data.confirmPassword,
        });

        toast({
          title: language === "en" ? "Account created!" : "खाता बन गया!",
          description: language === "en" 
            ? "Welcome to Samadhan. You can now sign in." 
            : "समाधान में आपका स्वागत है। अब आप साइन इन कर सकते हैं।",
        });
        navigate(ROUTES.SIGN_IN);
      } else {
        // Validate login Zod schema
        const validation = loginSchema.safeParse({ email, password });

        if (!validation.success) {
          const firstErr = validation.error.errors[0]?.message || "Validation failed";
          toast({
            title: language === "en" ? "Error" : "त्रुटि",
            description: firstErr,
            variant: "destructive",
          });
          setIsLoading(false);
          return;
        }

        const signInResult = await authService.signIn({
          email: validation.data.email,
          password: validation.data.password,
        });

        let isAdmin = false;
        if (signInResult?.user) {
          try {
            const { adminService } = await import("@/features/admin/services/adminService");
            isAdmin = await adminService.checkIsAdmin(signInResult.user.id);
          } catch (e) {
            logger.error("Failed to check admin status on sign in:", e);
          }
        }

        toast({
          title: language === "en" ? "Welcome back!" : "वापस स्वागत है!",
          description: language === "en" 
            ? "You have successfully signed in." 
            : "आपने सफलतापूर्वक साइन इन कर लिया है।",
        });

        if (isAdmin) {
          navigate(ROUTES.ADMIN);
        } else {
          navigate(ROUTES.DASHBOARD);
        }
      }
    } catch (error: any) {
      logger.error("Authentication action failed:", error);
      toast({
        title: language === "en" ? "Error" : "त्रुटि",
        description: error.message || "An authentication error occurred.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex w-full">
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 civic-gradient relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23fff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }} />
        </div>
        
        <div className="relative z-10 flex flex-col justify-center px-12 text-primary-foreground">
          <Link to={ROUTES.LANDING} className="flex items-center gap-3 mb-12">
            <div className="w-14 h-14 rounded-2xl bg-primary-foreground/20 flex items-center justify-center shadow-lg">
              <span className="text-primary-foreground font-bold text-2xl">स</span>
            </div>
            <div>
              <h1 className="font-bold text-2xl">Samadhan</h1>
              <p className="text-sm text-primary-foreground/70">समाधान</p>
            </div>
          </Link>
          
          <h2 className="text-4xl font-bold mb-6 leading-tight">
            {language === "en" 
              ? "Empowering Citizens Through Technology" 
              : "प्रौद्योगिकी के माध्यम से नागरिकों को सशक्त बनाना"}
          </h2>
          <p className="text-lg text-primary-foreground/80 mb-8">
            {language === "en"
              ? "Report issues, access schemes, and get AI assistance—all in one place."
              : "समस्याओं की रिपोर्ट करें, योजनाओं तक पहुंचें, और AI सहायता प्राप्त करें—सब एक जगह।"}
          </p>
          
          <div className="flex items-center gap-6">
            <div className="text-center">
              <p className="text-3xl font-bold">50K+</p>
              <p className="text-sm text-primary-foreground/70">{t("hero.issuesResolved")}</p>
            </div>
            <div className="w-px h-12 bg-primary-foreground/20" />
            <div className="text-center">
              <p className="text-3xl font-bold">2.5L+</p>
              <p className="text-sm text-primary-foreground/70">{t("hero.activeCitizens")}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Form */}
      <div className="flex-1 flex flex-col">
        {/* Top Bar */}
        <div className="flex items-center justify-between p-4 sm:p-6">
          <Link to={ROUTES.LANDING} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">{language === "en" ? "Back to Home" : "होम पर वापस"}</span>
          </Link>
          <Button variant="ghost" size="sm" onClick={toggleLanguage} className="gap-2">
            <Globe className="w-4 h-4" />
            {language === "en" ? "हिंदी" : "English"}
          </Button>
        </div>

        {/* Form Container */}
        <div className="flex-1 flex items-center justify-center px-4 sm:px-8">
          <div className="w-full max-w-md">
            {/* Mobile Logo */}
            <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
              <div className="w-12 h-12 rounded-xl civic-gradient flex items-center justify-center shadow-md">
                <span className="text-primary-foreground font-bold text-xl">स</span>
              </div>
              <div>
                <h1 className="font-bold text-xl text-foreground">Samadhan</h1>
                <p className="text-xs text-muted-foreground">समाधान</p>
              </div>
            </div>

            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-foreground mb-2">
                {isSignUp ? t("auth.createAccount") : t("auth.welcomeBack")}
              </h2>
              <p className="text-muted-foreground">
                {isSignUp ? t("auth.joinCommunity") : t("auth.signInContinue")}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {isSignUp && (
                <div className="space-y-2">
                  <Label htmlFor="fullName">{t("auth.fullName")}</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="fullName"
                      type="text"
                      placeholder={language === "en" ? "Enter your full name" : "अपना पूरा नाम दर्ज करें"}
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">{t("auth.email")}</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder={language === "en" ? "Enter your email" : "अपना ईमेल दर्ज करें"}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">{t("auth.password")}</Label>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder={language === "en" ? "Enter your password" : "अपना पासवर्ड दर्ज करें"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {isSignUp && (
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">{t("auth.confirmPassword")}</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="confirmPassword"
                      type={showPassword ? "text" : "password"}
                      placeholder={language === "en" ? "Confirm your password" : "अपना पासवर्ड पुष्टि करें"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>
              )}

              <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    {isSignUp ? t("auth.signingUp") : t("auth.signingIn")}
                  </>
                ) : (
                  <>
                    <Shield className="w-4 h-4 mr-2" />
                    {isSignUp ? t("auth.signUp") : t("auth.signIn")}
                  </>
                )}
              </Button>
            </form>

            <p className="text-center text-sm text-muted-foreground mt-6">
              {isSignUp ? t("auth.hasAccount") : t("auth.noAccount")}{" "}
              <Link 
                to={isSignUp ? ROUTES.SIGN_IN : ROUTES.SIGN_UP} 
                className="text-primary font-medium hover:underline"
              >
                {isSignUp ? t("auth.signIn") : t("auth.signUp")}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
