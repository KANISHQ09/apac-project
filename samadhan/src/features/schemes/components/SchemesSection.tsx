/**
 * SchemesSection.tsx
 * ------------------
 * Renders government welfare schemes segmented into:
 *  Eligible For You — schemes the algorithm matched to the user profile
 *  All Schemes     — remaining schemes for general browsing
 */

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { useLanguage } from "@/app/providers/LanguageProvider";
import { useAuth } from "@/features/auth";
import { useProfileData } from "@/features/profile";
import { useSchemes } from "../hooks/useSchemes";
import { Scheme } from "@/shared/types/domain/Scheme";
import { LoadingState } from "@/shared/components/LoadingState";
import { ErrorState } from "@/shared/components/ErrorState";
import { EmptyState } from "@/shared/components/EmptyState";
import { useDocuments } from "@/features/documents/hooks/useDocuments";
import { useNavigate } from "react-router-dom";
import { ROUTES } from "@/shared/config/routes";
import { 
  schemeAttachmentService, 
  SchemeAttachment 
} from "../services/schemeAttachmentService";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import {
  Shield,
  CheckCircle2,
  ArrowRight,
  Users,
  Sparkles,
  AlertCircle,
  ListFilter,
  FolderLock,
  ChevronDown,
  ChevronUp,
  Link2,
  FileCheck,
  FileX
} from "lucide-react";

interface EligibilityResult {
  isEligible: boolean;
  reasons: string[];
}

function evaluateEligibility(schemeId: string, inputs: {
  age: number;
  income: number;
  gender: string;
  occupation: string;
  housing: string;
  shgMember: string;
}, lang: "en" | "hi"): EligibilityResult {
  const reasons: string[] = [];
  let isEligible = true;

  switch (schemeId) {
    case "1": // PMAY
      if (inputs.housing === "pucca") {
        isEligible = false;
        reasons.push(lang === "en" ? "Owns a pucca house" : "पक्का मकान है");
      }
      if (inputs.income > 300000) {
        isEligible = false;
        reasons.push(lang === "en" ? "Family income exceeds ₹3 Lakhs" : "पारिवारिक आय ₹3 लाख से अधिक है");
      }
      if (isEligible) {
        reasons.push(lang === "en" ? "Income is under ₹3 Lakhs and does not own a pucca house" : "आय ₹3 लाख से कम है और कोई पक्का मकान नहीं है");
      }
      break;

    case "2": // Ayushman Bharat
      if (inputs.income > 250000) {
        isEligible = false;
        reasons.push(lang === "en" ? "Family income exceeds ₹2.5 Lakhs" : "पारिवारिक आय ₹2.5 लाख से अधिक है");
      }
      if (isEligible) {
        reasons.push(lang === "en" ? "Income is under ₹2.5 Lakhs threshold" : "आय ₹2.5 लाख की सीमा से कम है");
      }
      break;

    case "3": // PM-KISAN
      if (inputs.occupation !== "farmer") {
        isEligible = false;
        reasons.push(lang === "en" ? "Occupation is not Farmer" : "व्यवसाय किसान नहीं है");
      }
      if (isEligible) {
        reasons.push(lang === "en" ? "Verified as small/marginal farmer with agricultural land" : "कृषि भूमि वाले छोटे/सीमांत किसान के रूप में सत्यापित");
      }
      break;

    case "4": // PM Vishwakarma
      if (inputs.occupation !== "artisan") {
        isEligible = false;
        reasons.push(lang === "en" ? "Occupation is not Artisan / Craftsperson" : "व्यवसाय कारीगर / शिल्पकार नहीं है");
      }
      if (inputs.age < 18) {
        isEligible = false;
        reasons.push(lang === "en" ? "Age is under 18 years" : "आयु 18 वर्ष से कम है");
      }
      if (isEligible) {
        reasons.push(lang === "en" ? "Artisan over 18 years of age" : "18 वर्ष से अधिक आयु के कारीगर");
      }
      break;

    case "5": // NSP
      if (inputs.occupation !== "student") {
        isEligible = false;
        reasons.push(lang === "en" ? "Occupation is not Student" : "व्यवसाय छात्र नहीं है");
      }
      if (inputs.income > 200000) {
        isEligible = false;
        reasons.push(lang === "en" ? "Family income exceeds ₹2 Lakhs" : "पारिवारिक आय ₹2 लाख से अधिक है");
      }
      if (isEligible) {
        reasons.push(lang === "en" ? "Student with family income under ₹2 Lakhs" : "₹2 लाख से कम पारिवारिक आय वाले छात्र");
      }
      break;

    case "6": // Lakhpati Didi
      if (inputs.gender !== "female") {
        isEligible = false;
        reasons.push(lang === "en" ? "Only female citizens are eligible" : "केवल महिला नागरिक ही पात्र हैं");
      }
      if (inputs.shgMember !== "yes") {
        isEligible = false;
        reasons.push(lang === "en" ? "Must be a Self-Help Group (SHG) member" : "स्वयं सहायता समूह (SHG) का सदस्य होना आवश्यक है");
      }
      if (isEligible) {
        reasons.push(lang === "en" ? "Female member of Self-Help Group (SHG)" : "स्वयं सहायता समूह (SHG) की महिला सदस्य");
      }
      break;

    case "7": // PM Mudra Yojana
      if (inputs.occupation !== "self_employed" && inputs.occupation !== "business") {
        isEligible = false;
        reasons.push(lang === "en" ? "Must be self-employed or owning a micro-business" : "स्व-नियोजित या सूक्ष्म-व्यवसाय का स्वामी होना चाहिए");
      }
      if (isEligible) {
        reasons.push(lang === "en" ? "Self-employed or micro-business owner" : "स्व-नियोजित या सूक्ष्म-व्यवसाय स्वामी");
      }
      break;

    default:
      reasons.push(lang === "en" ? "General scheme parameters matched" : "सामान्य योजना मापदंड मेल खाते हैं");
  }

  return { isEligible, reasons };
}

export function SchemesSection() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const { profile } = useProfileData(user, language);
  const { schemes, eligibleSchemes, otherSchemes, loading, error } = useSchemes(user, profile);

  // Hook into document locker reactively
  const { lockerDetails } = useDocuments();

  // Keep track of scheme attachments reactively using schemeAttachmentService observer events
  const [attachments, setAttachments] = useState<SchemeAttachment[]>([]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setAttachments(schemeAttachmentService.getAttachments());
      const sync = () => setAttachments(schemeAttachmentService.getAttachments());
      window.addEventListener("scheme_attachments_changed", sync);
      return () => window.removeEventListener("scheme_attachments_changed", sync);
    }
  }, []);

  const [activeTab, setActiveTab] = useState<"eligible" | "all">("eligible");

  const [formData, setFormData] = useState({
    age: "25",
    income: "150000",
    gender: "male",
    occupation: "salaried",
    housing: "pucca",
    shgMember: "no",
    state: "",
  });
  const [hasCalculated, setHasCalculated] = useState(false);
  const [calculatedResults, setCalculatedResults] = useState<Record<string, EligibilityResult>>({});

  useEffect(() => {
    if (profile) {
      setFormData((prev) => ({
        ...prev,
        state: profile.state || "",
      }));
    }
  }, [profile]);

  const handleCalculate = (e: React.FormEvent) => {
    e.preventDefault();
    const ageNum = parseInt(formData.age) || 0;
    const incomeNum = parseInt(formData.income) || 0;

    const newResults: Record<string, EligibilityResult> = {};
    for (const s of schemes) {
      newResults[s.id] = evaluateEligibility(s.id, {
        age: ageNum,
        income: incomeNum,
        gender: formData.gender,
        occupation: formData.occupation,
        housing: formData.housing,
        shgMember: formData.shgMember,
      }, language);
    }
    setCalculatedResults(newResults);
    setHasCalculated(true);
    setActiveTab("eligible");
  };

  const handleReset = () => {
    setFormData({
      age: "25",
      income: "150000",
      gender: "male",
      occupation: "salaried",
      housing: "pucca",
      shgMember: "no",
      state: profile?.state || "",
    });
    setHasCalculated(false);
    setCalculatedResults({});
    setActiveTab("eligible");
  };

  const computedEligible = useMemo(() => {
    if (!hasCalculated) return [];
    return schemes.filter((s) => calculatedResults[s.id]?.isEligible);
  }, [hasCalculated, schemes, calculatedResults]);

  const computedOther = useMemo(() => {
    if (!hasCalculated) return schemes;
    return schemes.filter((s) => !calculatedResults[s.id]?.isEligible);
  }, [hasCalculated, schemes, calculatedResults]);

  const displayedSchemes =
    activeTab === "eligible" ? computedEligible : [...computedEligible, ...computedOther];

  return (
    <section id="schemes" className="py-20 bg-muted/30">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-accent/10 rounded-full text-accent text-sm font-medium mb-4">
            <Shield className="w-4 h-4" />
            {t("schemes.badge")}
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
            {t("schemes.title")}
          </h2>
          <p className="text-muted-foreground">
            {t("schemes.subtitle")}
          </p>
        </div>

        {/* Eligibility Checker Card */}
        <div className="bg-card rounded-2xl border border-border p-6 mb-12 shadow-card hover:border-accent/30 transition-all">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-foreground">
                {language === "en" ? "Interactive Eligibility Calculator" : "इंटरएक्टिव पात्रता कैलकुलेटर"}
              </h3>
              <p className="text-sm text-muted-foreground">
                {language === "en" ? "Enter your details to check which welfare schemes match your profile." : "यह जांचने के लिए अपना विवरण दर्ज करें कि कौन सी कल्याणकारी योजनाएं आपकी प्रोफ़ाइल से मेल खाती हैं।"}
              </p>
            </div>
          </div>

          <form onSubmit={handleCalculate} className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Age Input */}
            <div className="space-y-2">
              <Label htmlFor="age" className="text-sm font-semibold text-foreground">
                {language === "en" ? "Age (Years)" : "आयु (वर्ष)"}
              </Label>
              <Input
                type="number"
                id="age"
                value={formData.age}
                onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                placeholder="e.g. 25"
                min="0"
                max="120"
                required
              />
            </div>

            {/* Income Input */}
            <div className="space-y-2">
              <Label htmlFor="income" className="text-sm font-semibold text-foreground">
                {language === "en" ? "Annual Family Income (₹)" : "वार्षिक पारिवारिक आय (₹)"}
              </Label>
              <Input
                type="number"
                id="income"
                value={formData.income}
                onChange={(e) => setFormData({ ...formData, income: e.target.value })}
                placeholder="e.g. 150000"
                min="0"
                required
              />
            </div>

            {/* Gender Select */}
            <div className="space-y-2">
              <Label htmlFor="gender" className="text-sm font-semibold text-foreground">
                {language === "en" ? "Gender" : "लिंग"}
              </Label>
              <select
                id="gender"
                value={formData.gender}
                onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="male">{language === "en" ? "Male" : "पुरुष"}</option>
                <option value="female">{language === "en" ? "Female" : "महिला"}</option>
                <option value="other">{language === "en" ? "Other" : "अन्य"}</option>
              </select>
            </div>

            {/* Occupation Select */}
            <div className="space-y-2">
              <Label htmlFor="occupation" className="text-sm font-semibold text-foreground">
                {language === "en" ? "Occupation / Sector" : "व्यवसाय / क्षेत्र"}
              </Label>
              <select
                id="occupation"
                value={formData.occupation}
                onChange={(e) => setFormData({ ...formData, occupation: e.target.value })}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="student">{language === "en" ? "Student" : "छात्र"}</option>
                <option value="farmer">{language === "en" ? "Farmer" : "किसान"}</option>
                <option value="artisan">{language === "en" ? "Artisan / Craftsperson" : "कारीगर / शिल्पकार"}</option>
                <option value="self_employed">{language === "en" ? "Self Employed / Micro-Business" : "स्व-नियोजित / सूक्ष्म व्यवसाय"}</option>
                <option value="salaried">{language === "en" ? "Salaried / Employee" : "वेतनभोगी / कर्मचारी"}</option>
                <option value="other">{language === "en" ? "Unemployed / Other" : "बेरोजगार / अन्य"}</option>
              </select>
            </div>

            {/* Housing Type */}
            <div className="space-y-2">
              <Label htmlFor="housing" className="text-sm font-semibold text-foreground">
                {language === "en" ? "Housing Type" : "आवास का प्रकार"}
              </Label>
              <select
                id="housing"
                value={formData.housing}
                onChange={(e) => setFormData({ ...formData, housing: e.target.value })}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="pucca">{language === "en" ? "Owns a Pucca House" : "पक्का मकान है"}</option>
                <option value="kutcha">{language === "en" ? "Rented / Kutcha House" : "किराए का / कच्चा मकान"}</option>
              </select>
            </div>

            {/* SHG Member */}
            <div className="space-y-2">
              <Label htmlFor="shgMember" className="text-sm font-semibold text-foreground">
                {language === "en" ? "Self-Help Group (SHG) Member?" : "स्वयं सहायता समूह (SHG) सदस्य?"}
              </Label>
              <select
                id="shgMember"
                value={formData.shgMember}
                onChange={(e) => setFormData({ ...formData, shgMember: e.target.value })}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="no">{language === "en" ? "No" : "नहीं"}</option>
                <option value="yes">{language === "en" ? "Yes" : "हाँ"}</option>
              </select>
            </div>

            <div className="md:col-span-3 flex items-center justify-end gap-3 mt-2">
              {hasCalculated && (
                <Button type="button" variant="outline" onClick={handleReset}>
                  {language === "en" ? "Reset" : "रीसेट"}
                </Button>
              )}
              <Button type="submit" className="bg-accent text-accent-foreground hover:bg-accent/90 gap-2">
                <Sparkles className="w-4 h-4" />
                {language === "en" ? "Check Eligibility" : "पात्रता जांचें"}
              </Button>
            </div>
          </form>

          {/* Calculator Results Info Banner */}
          {hasCalculated && (
            <div className="mt-6 p-4 rounded-xl border border-accent/20 bg-accent/5 flex items-center justify-between gap-4 animate-fade-in">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-accent/10 text-accent flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-semibold text-foreground text-sm">
                    {language === "en"
                      ? `Calculation Complete: You qualify for ${computedEligible.length} out of ${schemes.length} schemes!`
                      : `नतीजा: आप ${schemes.length} में से ${computedEligible.length} योजनाओं के लिए पात्र हैं!`}
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    {language === "en"
                      ? "Schemes are now sorted. Eligible programs are displayed below."
                      : "योजनाओं को अब क्रमबद्ध कर दिया गया है। पात्र कार्यक्रम नीचे प्रदर्शित हैं।"}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Tab Switcher */}
        <div className="flex gap-2 mb-8 p-1 bg-muted rounded-xl w-fit">
          <button
            onClick={() => setActiveTab("eligible")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === "eligible"
                ? "bg-card shadow text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <CheckCircle2 className="w-4 h-4 text-accent" />
            {language === "en" ? "Eligible For You" : "आपके लिए पात्र"}
            {!loading && (
              <span className="ml-1 text-xs bg-accent/15 text-accent px-1.5 py-0.5 rounded-full">
                {computedEligible.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("all")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === "all"
                ? "bg-card shadow text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <ListFilter className="w-4 h-4" />
            {language === "en" ? "All Schemes" : "सभी योजनाएं"}
            {!loading && (
              <span className="ml-1 text-xs bg-muted-foreground/15 text-muted-foreground px-1.5 py-0.5 rounded-full">
                {computedEligible.length + computedOther.length}
              </span>
            )}
          </button>
        </div>

        {/* Content States */}
        {loading ? (
          <div className="py-12 bg-card rounded-2xl border border-border">
            <LoadingState
              message={
                language === "en"
                  ? "Fetching government schemes..."
                  : "सरकारी योजनाएं लोड हो रही हैं..."
              }
            />
          </div>
        ) : error ? (
          <div className="py-12 bg-card rounded-2xl border border-border">
            <ErrorState message={error} />
          </div>
        ) : displayedSchemes.length === 0 ? (
          <EmptyState
            title={
              activeTab === "eligible"
                ? (language === "en" ? "No Eligible Schemes Found" : "कोई पात्र योजना नहीं मिली")
                : (language === "en" ? "No Schemes Found" : "कोई योजना नहीं मिली")
            }
            description={
              activeTab === "eligible"
                ? (hasCalculated
                  ? (language === "en"
                    ? "Try adjusting the calculator settings to match other criteria."
                    : "अन्य मानदंडों से मिलान करने के लिए कैलकुलेटर सेटिंग्स को समायोजित करने का प्रयास करें।")
                  : (language === "en"
                    ? "Use the Interactive Eligibility Calculator above to analyze welfare schemes for you."
                    : "अपने लिए कल्याणकारी योजनाओं का विश्लेषण करने के लिए ऊपर दिए गए इंटरएक्टिव पात्रता कैलकुलेटर का उपयोग करें।"))
                : (language === "en"
                  ? "We couldn't find any schemes in the database."
                  : "हमें डेटाबेस में कोई योजना नहीं मिली।")
            }
          />
        ) : (
          /* Schemes Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
            {displayedSchemes.map((scheme, index) => (
              <SchemeCard
                key={scheme.id}
                scheme={scheme}
                index={index}
                isHighlighted={!hasCalculated && scheme.isEligible}
                isCalculated={hasCalculated}
                calculationResult={calculatedResults[scheme.id]}
                lockerDocuments={lockerDetails?.documents || []}
                activeAttachments={attachments}
              />
            ))}
          </div>
        )}

        {/* Fake Policy Warning */}
        <div className="bg-destructive/5 border border-destructive/20 rounded-2xl p-6 flex flex-col sm:flex-row items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
            <AlertCircle className="w-6 h-6 text-destructive" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-foreground mb-2">{t("schemes.fakeWarning")}</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {t("schemes.fakeDesc")}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive border-destructive/30 hover:bg-destructive/10"
            >
              {t("schemes.reportFake")}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

// --------------------------------------------------------------------------
// SchemeCard
// --------------------------------------------------------------------------

function SchemeCard({
  scheme,
  index,
  isHighlighted,
  isCalculated,
  calculationResult,
  lockerDocuments,
  activeAttachments,
}: {
  scheme: Scheme;
  index: number;
  isHighlighted?: boolean;
  isCalculated?: boolean;
  calculationResult?: { isEligible: boolean; reasons: string[] };
  lockerDocuments: any[];
  activeAttachments: SchemeAttachment[];
}) {
  const { t, language } = useLanguage();
  const [isExpanded, setIsExpanded] = useState(false);
  const navigate = useNavigate();

  const title = language === "en" ? scheme.titleEn : scheme.titleHi;
  const description = language === "en" ? scheme.descriptionEn : scheme.descriptionHi;
  const category = language === "en" ? scheme.categoryEn : scheme.categoryHi;
  const eligibility = language === "en" ? scheme.eligibilityEn : scheme.eligibilityHi;
  const deadline = language === "en" ? scheme.deadlineEn : scheme.deadlineHi;

  const showEligible = isCalculated ? calculationResult?.isEligible : isHighlighted;

  // 1. Calculate Document Readiness Progress & Status
  const documentMetrics = useMemo(() => {
    const required = scheme.requiredDocuments || [];
    if (required.length === 0) return null;

    const uploadedTypes = new Set(
      lockerDocuments.map((d) => d.document_type?.toLowerCase() || "")
    );

    const available = required.filter((r) => uploadedTypes.has(r.toLowerCase()));
    const missing = required.filter((r) => !uploadedTypes.has(r.toLowerCase()));
    const percentage = Math.round((available.length / required.length) * 100);

    // Readiness Status Classification
    let statusText = "Not Started";
    let statusColor = "bg-muted text-muted-foreground border-border";

    if (percentage === 100) {
      statusText = "Ready";
      statusColor = "bg-accent/15 text-accent border-accent/35";
    } else if (missing.length === 1 && required.length > 1) {
      statusText = "Almost Ready";
      statusColor = "bg-warning/15 text-warning border-warning/35";
    } else if (available.length > 0) {
      statusText = "Missing Documents";
      statusColor = "bg-warning/15 text-warning border-warning/35";
    }

    if (language === "hi") {
      if (statusText === "Ready") statusText = "तैयार";
      if (statusText === "Almost Ready") statusText = "लगभग तैयार";
      if (statusText === "Missing Documents") statusText = "दस्तावेज़ गायब";
      if (statusText === "Not Started") statusText = "शुरू नहीं हुआ";
    }

    return { required, available, missing, percentage, statusText, statusColor };
  }, [scheme.requiredDocuments, lockerDocuments, language]);

  // Translate document type keys to human readable labels
  const getDocTypeLabel = (type: string) => {
    const lower = type.toLowerCase();
    switch (lower) {
      case "aadhaar":
        return language === "en" ? "Aadhaar" : "आधार";
      case "pan":
        return language === "en" ? "PAN" : "पैन";
      case "income":
        return language === "en" ? "Income Certificate" : "आय प्रमाण पत्र";
      case "property":
        return language === "en" ? "Property Document" : "संपत्ति दस्तावेज़";
      case "license":
        return language === "en" ? "Driving Licence" : "ड्राइविंग लाइसेंस";
      default:
        return type;
    }
  };

  const handleOpenLocker = () => {
    navigate(ROUTES.DOCUMENTS);
  };

  const handleAttach = (docType: string, file: any) => {
    schemeAttachmentService.attachFileToScheme(
      scheme.id,
      docType,
      file.id,
      file.file_path,
      file.name
    );
  };

  const handleDetach = (docType: string) => {
    schemeAttachmentService.detachFileFromScheme(scheme.id, docType);
  };

  return (
    <div
      className={`group bg-card rounded-2xl border shadow-card hover:shadow-lg transition-all overflow-hidden flex flex-col justify-between animate-slide-up ${
        showEligible
          ? "border-accent/40 ring-1 ring-accent/20"
          : "border-border"
      }`}
      style={{ animationDelay: `${index * 0.1}s` }}
    >
      <div>
        {/* Eligible ribbon */}
        {showEligible ? (
          <div className="bg-accent/10 border-b border-accent/20 px-4 py-1.5 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-accent" />
              <span className="text-xs font-medium text-accent">
                {language === "en" ? "Likely Eligible" : "संभवतः पात्र"}
              </span>
            </div>
            {/* Dynamic Readiness Badge */}
            {documentMetrics && (
              <Badge variant="outline" className={`text-[10px] font-bold py-0 px-2 rounded-full border ${documentMetrics.statusColor}`}>
                {documentMetrics.statusText}
              </Badge>
            )}
          </div>
        ) : isCalculated ? (
          <div className="bg-destructive/5 border-b border-destructive/10 px-4 py-1.5 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-destructive" />
              <span className="text-xs font-medium text-destructive">
                {language === "en" ? "Not Eligible" : "पात्र नहीं"}
              </span>
            </div>
            {documentMetrics && (
              <Badge variant="outline" className={`text-[10px] font-bold py-0 px-2 rounded-full border ${documentMetrics.statusColor}`}>
                {documentMetrics.statusText}
              </Badge>
            )}
          </div>
        ) : null}

        <div className="p-6 pb-0">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                {scheme.icon || <Shield className="w-5 h-5" />}
              </div>
              <div>
                <Badge variant="secondary" className="text-xs mb-1">
                  {category}
                </Badge>
                {deadline && (
                  <p className="text-xs text-warning font-medium">
                    {t("schemes.deadline")}: {deadline}
                  </p>
                )}
              </div>
            </div>
            {/* Renamed to Trust Score */}
            <div className="flex items-center gap-1 px-2.5 py-1 bg-accent/10 rounded-full shrink-0 border border-accent/20">
              <Shield className="w-3 h-3 text-accent" />
              <span className="text-[10px] font-bold text-accent">Trust Score: {scheme.trustScore}%</span>
            </div>
          </div>

          {/* Content */}
          <h3 className="font-semibold text-foreground mb-2 group-hover:text-primary transition-colors text-left">
            {title}
          </h3>
          <p className="text-sm text-muted-foreground mb-4 text-left">{description}</p>

          {/* Eligibility Criteria */}
          <div className="flex flex-wrap gap-2 mb-4">
            {eligibility.map((item, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 px-2 py-1 bg-muted text-muted-foreground rounded-lg text-xs"
              >
                <Users className="w-3 h-3" />
                {item}
              </span>
            ))}
          </div>

          {/* Document Readiness Progress Indicator */}
          {documentMetrics && (
            <div className="p-3 bg-muted/20 border border-border/40 rounded-xl text-left mb-4">
              <div className="flex justify-between items-center mb-1 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                <span>{language === "en" ? "Document Readiness" : "दस्तावेज़ तत्परता"}</span>
                <span className="text-primary">{documentMetrics.percentage}%</span>
              </div>
              <div className="w-full bg-muted h-2 rounded-full overflow-hidden flex">
                <div 
                  className="bg-primary h-full transition-all duration-500 rounded-full"
                  style={{ width: `${documentMetrics.percentage}%` }}
                />
              </div>
              {/* Helper info line below the readiness progress bar */}
              <p className="text-[10px] text-muted-foreground mt-1.5 font-medium leading-none">
                {language === "en"
                  ? `${documentMetrics.available.length} of ${documentMetrics.required.length} required documents available`
                  : `${documentMetrics.required.length} में से ${documentMetrics.available.length} आवश्यक दस्तावेज़ उपलब्ध हैं`
                }
              </p>
            </div>
          )}

          {/* Calculator Reasons */}
          {isCalculated && calculationResult && (
            <div className={`mt-4 p-3 rounded-xl text-xs border text-left ${
              calculationResult.isEligible 
                ? "bg-accent/5 border-accent/25 text-foreground" 
                : "bg-destructive/5 border-destructive/25 text-muted-foreground"
            }`}>
              <span className="font-semibold block mb-1 text-foreground">
                {language === "en" ? "Result Details:" : "परिणाम विवरण:"}
              </span>
              <ul className="list-disc pl-4 space-y-1">
                {calculationResult.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Expandable Document Checklist Details */}
          {isExpanded && documentMetrics && (
            <div className="mt-4 pt-4 border-t border-border/50 text-left animate-fade-in space-y-4">
              <div>
                <h4 className="text-xs uppercase font-extrabold text-muted-foreground mb-2.5 flex items-center gap-1">
                  <FolderLock className="w-3.5 h-3.5 text-primary" />
                  {language === "en" ? "Required Documents" : "आवश्यक दस्तावेज़"}
                </h4>
                
                <div className="space-y-2">
                  {documentMetrics.required.map((docType) => {
                    const availableFiles = lockerDocuments.filter(
                      (d) => d.document_type?.toLowerCase() === docType.toLowerCase()
                    );
                    const isAvailable = availableFiles.length > 0;
                    
                    // Check if there is an active attachment
                    const attachment = activeAttachments.find(
                      (a) => a.schemeId === scheme.id && a.documentType.toLowerCase() === docType.toLowerCase()
                    );

                    return (
                      <div 
                        key={docType} 
                        className="flex items-center justify-between p-2.5 bg-muted/40 border border-border/30 rounded-lg text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {isAvailable ? (
                            <span className="text-accent font-bold shrink-0">✓</span>
                          ) : (
                            <span className="text-destructive font-bold shrink-0">✕</span>
                          )}
                          <div className="min-w-0">
                            <span className="font-medium text-foreground">
                              {getDocTypeLabel(docType)} {isAvailable ? `(${language === "en" ? "Available" : "उपलब्ध"})` : `(${language === "en" ? "Missing" : "गायब"})`}
                            </span>
                            {attachment && (
                              <span className="text-[10px] text-accent font-semibold truncate block mt-0.5 max-w-[150px]">
                                Attached: {attachment.fileName}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Attach/Upload Action Button */}
                        <div className="shrink-0 ml-3">
                          {attachment ? (
                            <Button 
                              variant="ghost" 
                              size="xs" 
                              onClick={() => handleDetach(docType)}
                              className="text-destructive hover:bg-destructive/10 text-[10px] h-7 px-2 font-bold"
                            >
                              Detach
                            </Button>
                          ) : isAvailable ? (
                            availableFiles.length === 1 ? (
                              <Button 
                                variant="outline" 
                                size="xs" 
                                onClick={() => handleAttach(docType, availableFiles[0])}
                                className="text-primary hover:bg-primary/10 text-[10px] h-7 px-2 border-primary/20 flex items-center gap-1 font-bold"
                              >
                                <Link2 className="w-3 h-3" />
                                Attach from Locker
                              </Button>
                            ) : (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button 
                                    variant="outline" 
                                    size="xs" 
                                    className="text-primary hover:bg-primary/10 text-[10px] h-7 px-2 border-primary/20 flex items-center gap-1 font-bold"
                                  >
                                    <Link2 className="w-3 h-3" />
                                    Attach from Locker...
                                    <ChevronDown className="w-2.5 h-2.5" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-56">
                                  {availableFiles.map((file) => (
                                    <DropdownMenuItem 
                                      key={file.id} 
                                      onClick={() => handleAttach(docType, file)}
                                      className="text-xs truncate cursor-pointer"
                                    >
                                      {file.name}
                                    </DropdownMenuItem>
                                  ))}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )
                          ) : (
                            <Button 
                              variant="outline" 
                              size="xs" 
                              onClick={handleOpenLocker}
                              className="text-muted-foreground hover:bg-muted text-[10px] h-7 px-2 border-border"
                            >
                              Open Document Locker
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Status Readiness Warning */}
              <div className="flex items-center justify-between p-3.5 bg-muted/40 border border-border/40 rounded-xl text-xs gap-3">
                <p className="text-muted-foreground font-medium flex-1">
                  {documentMetrics.percentage === 100
                    ? (language === "en" ? "Your required documents are ready." : "आपके आवश्यक दस्तावेज़ तैयार हैं।")
                    : (language === "en" ? "Upload the missing documents to improve application readiness." : "आवेदन तत्परता में सुधार के लिए गायब दस्तावेज़ों को अपलोड करें।")
                  }
                </p>
                {documentMetrics.percentage < 100 && (
                  <Button 
                    variant="outline" 
                    size="xs" 
                    onClick={handleOpenLocker}
                    className="shrink-0 gap-1 text-[11px] font-bold"
                  >
                    Open Document Locker
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="p-6 pt-0">
        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-border mt-4">
          {showEligible ? (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-accent">
              <CheckCircle2 className="w-4 h-4" />
              {t("schemes.mayBeEligible")}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">
              {language === "en" ? "Not Eligible" : "पात्र नहीं"}
            </span>
          )}
          <Button 
            variant="ghost" 
            size="sm" 
            className="gap-1 font-bold text-xs" 
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? (
              <>
                Hide Details
                <ChevronUp className="w-4 h-4" />
              </>
            ) : (
              <>
                {t("schemes.learnMore")}
                <ChevronDown className="w-4 h-4" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
