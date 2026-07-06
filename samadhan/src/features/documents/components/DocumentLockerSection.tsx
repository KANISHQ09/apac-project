import { useRef, useState, useMemo } from "react";
import { Button } from "@/shared/components/ui/button";
import { useLanguage } from "@/app/providers/LanguageProvider";
import { useDocuments } from "../hooks/useDocuments";
import { LoadingState } from "@/shared/components/LoadingState";
import { ErrorState } from "@/shared/components/ErrorState";
import { EmptyState } from "@/shared/components/EmptyState";
import { useToast } from "@/shared/hooks/use-toast";
import { DocumentType } from "@/shared/types/domain/Document";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from "@/shared/components/ui/dialog";
import { 
  FolderLock, 
  Upload, 
  Shield, 
  Bell,
  FileText,
  Lock,
  CheckCircle2,
  Trash2,
  ExternalLink,
  Loader2,
  CreditCard,
  Home,
  AlertTriangle,
  Search,
  Eye,
  Sparkles,
  BookOpen,
  Calendar,
  User,
  Building,
  FileCheck
} from "lucide-react";

export function DocumentLockerSection() {
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { 
    lockerDetails, 
    loading, 
    error, 
    uploadStep, 
    uploadProgress, 
    uploadDocument, 
    deleteDocument, 
    getDownloadUrl 
  } = useDocuments();

  // Search & Preview States
  const [searchQuery, setSearchQuery] = useState("");
  const [previewDoc, setPreviewDoc] = useState<DocumentType | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(false);

  const features = [
    {
      icon: <Shield className="w-6 h-6" />,
      title: t("documents.bankGrade"),
      description: t("documents.bankDesc"),
    },
    {
      icon: <FileText className="w-6 h-6" />,
      title: t("documents.autoTagging"),
      description: t("documents.autoDesc"),
    },
    {
      icon: <Bell className="w-6 h-6" />,
      title: t("documents.expiryReminders"),
      description: t("documents.expiryDesc"),
    },
    {
      icon: <Upload className="w-6 h-6" />,
      title: t("documents.quickReuse"),
      description: t("documents.reuseDesc"),
    },
  ];

  // 1. Expiry countdown parser helper
  const getExpiryDetails = (expiryDate?: string | null) => {
    if (!expiryDate) return null;
    const exp = new Date(expiryDate);
    if (isNaN(exp.getTime())) return null;

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    exp.setHours(0, 0, 0, 0);

    const diffTime = exp.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1024 * 60 * 60 * 24));

    if (diffDays < 0) {
      return { label: language === "en" ? "Expired" : "समाप्त", type: "expired" as const };
    } else if (diffDays <= 30) {
      return { 
        label: language === "en" ? `Expires in ${diffDays} days` : `${diffDays} दिनों में समाप्त`, 
        type: "soon" as const 
      };
    }
    return null;
  };

  // 2. Rule-Based Extensible AI Readiness Insight Engine (Refined Contexts)
  const readinessInsight = useMemo(() => {
    if (!lockerDetails?.documents) return null;
    const docs = lockerDetails.documents;
    
    // 1. Expired check
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    for (const doc of docs) {
      const expStr = doc.metadata?.expiry_date;
      if (expStr) {
        const exp = new Date(expStr);
        if (!isNaN(exp.getTime()) && exp.getTime() < now.getTime()) {
          return {
            text: language === "en" 
              ? `Your ${doc.name} has expired. Please upload a renewed version soon.`
              : `आपका ${doc.name} समाप्त हो चुका है। कृपया जल्द ही नया दस्तावेज़ अपलोड करें।`,
            type: "error" as const
          };
        }
      }
    }

    // 2. Expiring soon check
    for (const doc of docs) {
      const expStr = doc.metadata?.expiry_date;
      if (expStr) {
        const exp = new Date(expStr);
        if (!isNaN(exp.getTime())) {
          const diffDays = Math.ceil((exp.getTime() - now.getTime()) / (1024 * 60 * 60 * 24));
          if (diffDays >= 0 && diffDays <= 30) {
            return {
              text: language === "en"
                ? `Your ${doc.name} expires in ${diffDays} days. Consider renewing it soon.`
                : `आपका ${doc.name} ${diffDays} दिनों में समाप्त हो रहा है। कृपया जल्द ही इसे नवीनीकृत करें।`,
              type: "warning" as const
            };
          }
        }
      }
    }

    const docTypes = docs.map((d) => d.document_type?.toLowerCase() || "");
    const hasAadhaar = docTypes.includes("aadhaar");
    const hasPan = docTypes.includes("pan");
    const hasIncome = docTypes.includes("income");

    // 3. Missing primary check
    if (!hasAadhaar || !hasPan) {
      return {
        text: language === "en"
          ? "You're missing a primary identity document. Upload Aadhaar or PAN to get started."
          : "आप एक प्राथमिक पहचान दस्तावेज़ खो रहे हैं। शुरू करने के लिए आधार या पैन अपलोड करें।",
        type: "warning" as const
      };
    }

    // 4. Missing income support certificate check
    if (!hasIncome) {
      return {
        text: language === "en"
          ? "Primary identity documents are complete. Upload an Income Certificate to unlock additional government scheme recommendations."
          : "प्राथमिक पहचान दस्तावेज़ पूर्ण हैं। अतिरिक्त सरकारी योजनाओं के सुझावों को अनलॉक करने के लिए एक आय प्रमाण पत्र अपलोड करें।",
        type: "info" as const
      };
    }

    // 5. Complete checks
    return {
      text: language === "en"
        ? "Your Aadhaar and PAN are available. You can now autofill most government forms."
        : "आपका आधार और पैन उपलब्ध हैं। अब आप अधिकांश सरकारी फ़ॉर्मों को स्वचालित रूप से भर सकते हैं।",
      type: "success" as const
    };
  }, [lockerDetails?.documents, language]);

  // 3. Dynamic Stats Counters derived reactive from state (With Icons)
  const stats = useMemo(() => {
    if (!lockerDetails?.documents) {
      return { identity: 0, property: 0, verified: 0, warnings: 0 };
    }
    const docs = lockerDetails.documents;
    
    let identity = 0;
    let property = 0;
    let verified = 0;
    let warnings = 0;

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    docs.forEach((doc) => {
      const type = doc.document_type?.toLowerCase() || "";
      if (["aadhaar", "pan", "license", "passport", "voterid"].includes(type)) {
        identity++;
      }
      if (type === "property") {
        property++;
      }
      if (doc.status === "verified" || doc.status === "uploaded") {
        verified++; // All successfully cataloged files count as processed
      }

      // Check warnings
      const expStr = doc.metadata?.expiry_date;
      if (expStr) {
        const exp = new Date(expStr);
        if (!isNaN(exp.getTime())) {
          const diffDays = Math.ceil((exp.getTime() - now.getTime()) / (1024 * 60 * 60 * 24));
          if (diffDays <= 30) {
            warnings++;
          }
        }
      }
    });

    return { identity, property, verified, warnings };
  }, [lockerDetails?.documents]);

  // 4. Memoized Smart Search Filter
  const filteredDocs = useMemo(() => {
    if (!lockerDetails?.documents) return [];
    const query = searchQuery.trim().toLowerCase();
    if (!query) return lockerDetails.documents;

    return lockerDetails.documents.filter((doc) => {
      const name = doc.name.toLowerCase();
      const type = (doc.document_type || "").toLowerCase();
      const ocr = (doc.extracted_text || "").toLowerCase();
      const holderName = (doc.metadata?.full_name || "").toLowerCase();
      const docNum = (doc.metadata?.document_number || "").toLowerCase();

      return (
        name.includes(query) ||
        type.includes(query) ||
        ocr.includes(query) ||
        holderName.includes(query) ||
        docNum.includes(query)
      );
    });
  }, [lockerDetails?.documents, searchQuery]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: "Invalid file type",
        description: "Only PDF, JPEG, PNG, or WebP files are accepted.",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "File size must be under 10MB.",
        variant: "destructive",
      });
      return;
    }

    try {
      await uploadDocument(file);
      toast({
        title: "Document Saved",
        description: "Your document was uploaded and successfully analyzed by Gemini AI.",
      });
    } catch (err: any) {
      toast({
        title: "Upload Failed",
        description: err.message || "Failed to process and upload the document.",
        variant: "destructive",
      });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleOpenPreview = async (doc: DocumentType) => {
    if (!doc.file_path) return;
    setPreviewDoc(doc);
    setLoadingUrl(true);
    try {
      const url = await getDownloadUrl(doc.file_path);
      setPreviewUrl(url);
    } catch (err) {
      toast({
        title: "Preview Error",
        description: "Could not retrieve secure download link.",
        variant: "destructive",
      });
    } finally {
      setLoadingUrl(false);
    }
  };

  const handleDelete = async (id: string, filePath: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this document from your secure locker?")) {
      return;
    }
    try {
      await deleteDocument(id, filePath);
      toast({
        title: "Document Deleted",
        description: "The document has been removed from your locker.",
      });
      if (previewDoc?.id === id) {
        setPreviewDoc(null);
        setPreviewUrl(null);
      }
    } catch (err) {
      toast({
        title: "Deletion Error",
        description: "Failed to remove the document.",
        variant: "destructive",
      });
    }
  };

  const getDocumentIcon = (type?: string) => {
    switch (type) {
      case "aadhaar":
      case "pan":
        return <CreditCard className="w-5 h-5 text-primary" />;
      case "license":
        return <Shield className="w-5 h-5 text-primary" />;
      case "property":
        return <Home className="w-5 h-5 text-primary" />;
      default:
        return <FileText className="w-5 h-5 text-primary" />;
    }
  };

  return (
    <section id="documents" className="py-20 bg-background relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-[0.02] pointer-events-none">
        <div className="absolute inset-0" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M11 18c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm48 25c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm-43-7c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm63 31c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM34 90c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm56-76c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM12 86c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm28-65c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm23-11c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm-6 60c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm29 22c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zM32 63c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm57-13c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm-9-21c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM60 91c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM35 41c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM12 60c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2z' fill='%23000' fill-opacity='1' fill-rule='evenodd'/%3E%3C/svg%3E")`,
        }} />
      </div>

      <div className="container mx-auto px-4 relative">
        <div className="grid lg:grid-cols-2 gap-12 items-start">
          {/* Left Content */}
          <div className="lg:sticky lg:top-24">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary/10 rounded-full text-primary text-sm font-medium mb-6">
              <FolderLock className="w-4 h-4" />
              {t("documents.badge")}
            </div>
            
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              {t("documents.title")}{" "}
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary-glow">{t("documents.locker")}</span>
            </h2>
            
            <p className="text-lg text-muted-foreground mb-8">
              {t("documents.subtitle")}
            </p>

            {/* Features */}
            <div className="grid sm:grid-cols-2 gap-4 mb-8">
              {features.map((feature, index) => (
                <div 
                  key={index}
                  className="flex items-start gap-3 p-4 bg-card rounded-xl border border-border"
                >
                  <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    {feature.icon}
                  </div>
                  <div>
                    <h4 className="font-medium text-foreground mb-0.5">{feature.title}</h4>
                    <p className="text-sm text-muted-foreground">{feature.description}</p>
                  </div>
                </div>
              ))}
            </div>

            <Button variant="hero" onClick={() => fileInputRef.current?.click()}>
              <Lock className="w-5 h-5" />
              {t("documents.openLocker")}
            </Button>
          </div>

          {/* Right - Document Preview */}
          <div className="relative">
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              onChange={handleFileChange}
              accept="application/pdf,image/jpeg,image/png,image/webp" 
            />

            <div className="bg-card rounded-3xl border border-border shadow-xl p-6 sm:p-8 relative min-h-[350px] flex flex-col justify-between overflow-hidden">
              {/* Visible AI Loading and Processing Overlay */}
              {uploadStep !== "idle" && (
                <div className="absolute inset-0 bg-card/95 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center z-50">
                  <div className="relative w-20 h-20 mb-4 flex items-center justify-center">
                    <Loader2 className="w-20 h-20 text-primary animate-spin absolute" />
                    <Upload className="w-8 h-8 text-primary animate-bounce" />
                  </div>
                  <h4 className="font-bold text-lg text-foreground mb-2">
                    {uploadStep === "uploading" && "Uploading document..."}
                    {uploadStep === "reading" && "Reading document..."}
                    {uploadStep === "extracting" && "Extracting document details..."}
                    {uploadStep === "checking" && "Checking expiry..."}
                    {uploadStep === "summarizing" && "Generating summary..."}
                    {uploadStep === "saving" && "Saving securely..."}
                    {uploadStep === "complete" && "Locker Updated!"}
                  </h4>
                  <p className="text-xs text-muted-foreground mb-4 max-w-[280px]">
                    {(uploadStep === "reading" || uploadStep === "extracting") && 
                      "Gemini AI is parsing base64 stream and running OCR extraction."}
                    {uploadStep === "saving" && "Cataloging attributes inside secure ledger."}
                  </p>
                  <div className="w-48 bg-muted rounded-full h-2 overflow-hidden">
                    <div 
                      className="bg-primary h-full transition-all duration-300 rounded-full"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <span className="text-xs font-bold text-primary mt-2">{uploadProgress}%</span>
                </div>
              )}

              {loading ? (
                <LoadingState message="Connecting to encrypted document locker..." />
              ) : error ? (
                <ErrorState message={error} />
              ) : !lockerDetails ? (
                <EmptyState title="No Locker Access" description="Your secure locker could not be initialized." />
              ) : (
                <>
                  <div className="space-y-6">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                          <FolderLock className="w-6 h-6" />
                        </div>
                        <div className="text-left">
                          <h4 className="font-semibold text-foreground">{t("documents.myDocuments")}</h4>
                          <p className="text-sm text-muted-foreground">
                            {lockerDetails.totalFiles} files • {lockerDetails.totalSizeMb} MB used
                          </p>
                        </div>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploadStep !== "idle"}>
                        <Upload className="w-4 h-4" />
                        {t("documents.upload")}
                      </Button>
                    </div>

                    {/* AI Readiness Insight Banner */}
                    {lockerDetails.documents.length > 0 && readinessInsight && (
                      <div className={`p-4 rounded-xl border flex gap-3 text-left animate-fade-in ${
                        readinessInsight.type === "error" ? "bg-destructive/10 border-destructive/20 text-destructive-foreground" :
                        readinessInsight.type === "warning" ? "bg-warning/10 border-warning/20 text-warning-foreground" :
                        readinessInsight.type === "info" ? "bg-info/10 border-info/20 text-info-foreground" :
                        "bg-accent/10 border-accent/20 text-accent-foreground"
                      }`}>
                        <div className="shrink-0 mt-0.5">
                          {readinessInsight.type === "error" && <AlertTriangle className="w-5 h-5 text-destructive" />}
                          {readinessInsight.type === "warning" && <AlertTriangle className="w-5 h-5 text-warning" />}
                          {readinessInsight.type === "info" && <Eye className="w-5 h-5 text-info" />}
                          {readinessInsight.type === "success" && <CheckCircle2 className="w-5 h-5 text-accent animate-pulse" />}
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-wider font-extrabold flex items-center gap-1 mb-1">
                            <Sparkles className="w-3.5 h-3.5" />
                            {language === "en" ? "AI Readiness Insight" : "एआई तत्परता अंतर्दृष्टि"}
                          </p>
                          <p className="text-sm leading-snug text-foreground/90 font-medium">
                            {readinessInsight.text}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Dynamic Stats Grid (With subtle icons) */}
                    {lockerDetails.documents.length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="p-3 bg-muted/40 rounded-xl border border-border/40 text-left flex items-center justify-between">
                          <div>
                            <span className="text-2xl font-bold text-foreground block">{stats.identity}</span>
                            <span className="text-[10px] uppercase font-bold text-muted-foreground">Identity Docs</span>
                          </div>
                          <CreditCard className="w-4 h-4 text-muted-foreground/60 shrink-0" />
                        </div>
                        <div className="p-3 bg-muted/40 rounded-xl border border-border/40 text-left flex items-center justify-between">
                          <div>
                            <span className="text-2xl font-bold text-foreground block">{stats.property}</span>
                            <span className="text-[10px] uppercase font-bold text-muted-foreground">Property Docs</span>
                          </div>
                          <Home className="w-4 h-4 text-muted-foreground/60 shrink-0" />
                        </div>
                        <div className="p-3 bg-muted/40 rounded-xl border border-border/40 text-left flex items-center justify-between">
                          <div>
                            <span className="text-2xl font-bold text-foreground block">{stats.verified}</span>
                            <span className="text-[10px] uppercase font-bold text-accent">AI Processed</span>
                          </div>
                          <FileCheck className="w-4 h-4 text-accent/70 shrink-0" />
                        </div>
                        <div className="p-3 bg-muted/40 rounded-xl border border-border/40 text-left flex items-center justify-between">
                          <div>
                            <span className="text-2xl font-bold text-foreground block">{stats.warnings}</span>
                            <span className={`text-[10px] uppercase font-bold ${stats.warnings > 0 ? "text-warning" : "text-muted-foreground"}`}>
                              Expiry Alerts
                            </span>
                          </div>
                          <AlertTriangle className={`w-4 h-4 shrink-0 ${stats.warnings > 0 ? "text-warning/80 animate-pulse" : "text-muted-foreground/60"}`} />
                        </div>
                      </div>
                    )}

                    {/* Smart Search Bar */}
                    {lockerDetails.documents.length > 0 && (
                      <div className="relative">
                        <Search className="w-4 h-4 text-muted-foreground absolute left-3.5 top-3" />
                        <input 
                          type="text" 
                          placeholder={language === "en" ? "Search documents, holder name, ID number, or extracted text..." : "दस्तावेज़, धारक का नाम, आईडी नंबर खोजें..."}
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full bg-muted/50 border border-border hover:border-border-hover focus:border-primary rounded-xl py-2 pl-10 pr-4 text-sm focus:outline-none transition-colors"
                        />
                        {searchQuery && (
                          <button 
                            onClick={() => setSearchQuery("")} 
                            className="text-xs text-muted-foreground hover:text-foreground absolute right-3 top-2.5 px-2 py-0.5 rounded hover:bg-muted"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    )}

                    {/* Document List and Empty State Section */}
                    {lockerDetails.documents.length === 0 ? (
                      <div className="py-12 px-6 text-center text-muted-foreground flex flex-col items-center justify-center space-y-3 border border-dashed border-border rounded-2xl bg-muted/10">
                        <FolderLock className="w-12 h-12 text-primary/40 animate-pulse" />
                        <h5 className="font-bold text-foreground text-base">
                          {language === "en" ? "No documents uploaded yet" : "अभी तक कोई दस्तावेज़ अपलोड नहीं किया गया"}
                        </h5>
                        <p className="text-sm max-w-sm leading-normal">
                          {language === "en" 
                            ? "Upload your Aadhaar, PAN, Driving Licence, Property Documents, or other government documents."
                            : "अपना आधार, पैन, ड्राइविंग लाइसेंस, संपत्ति के दस्तावेज़ या अन्य सरकारी दस्तावेज़ अपलोड करें।"}
                        </p>
                        <div className="pt-2 flex items-center justify-center gap-4 text-xs font-bold text-muted-foreground/80 bg-muted/30 px-4 py-1.5 rounded-full border border-border/40">
                          <span>Supported:</span>
                          <span className="flex items-center gap-1">• Images</span>
                          <span className="flex items-center gap-1">• PDFs</span>
                        </div>
                      </div>
                    ) : filteredDocs.length === 0 ? (
                      <div className="py-12 text-center text-muted-foreground flex flex-col items-center justify-center space-y-2 border border-dashed border-border rounded-xl">
                        <FileText className="w-10 h-10 text-muted-foreground/60 animate-pulse" />
                        <p className="font-semibold text-sm">
                          {language === "en" ? "No matching documents found" : "कोई मेल खाते दस्तावेज़ नहीं मिले"}
                        </p>
                        <p className="text-xs max-w-[280px]">
                          Try searching for a different keyword or metadata field.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3 max-h-[250px] overflow-y-auto pr-1">
                        {filteredDocs.map((doc, index) => {
                          const expiry = getExpiryDetails(doc.metadata?.expiry_date);
                          return (
                            <div 
                              key={doc.id || index}
                              onClick={() => handleOpenPreview(doc)}
                              className="flex items-center justify-between p-4 bg-muted/30 rounded-xl border border-border/40 hover:bg-muted/60 hover:border-border transition-all cursor-pointer group"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-10 h-10 rounded-lg bg-card flex items-center justify-center text-muted-foreground group-hover:text-primary transition-colors shrink-0 border border-border/30">
                                  {getDocumentIcon(doc.document_type)}
                                </div>
                                <span className="font-medium text-foreground truncate text-left">{doc.name}</span>
                              </div>
                              
                              <div className="flex items-center gap-3 shrink-0">
                                {/* Expiry Badges Calculated Dynamically */}
                                {expiry ? (
                                  <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                                    expiry.type === "expired" ? "bg-destructive/10 text-destructive border border-destructive/20 animate-pulse" :
                                    "bg-warning/10 text-warning border border-warning/20"
                                  }`}>
                                    <Bell className="w-3 h-3 shrink-0" />
                                    {expiry.label}
                                  </span>
                                ) : doc.status === "verified" || doc.status === "uploaded" ? (
                                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-accent px-2 py-0.5 rounded-full bg-accent/10 border border-accent/20">
                                    <CheckCircle2 className="w-3 h-3 shrink-0" />
                                    {language === "en" ? "AI Processed" : "एआई संसाधित"}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground px-2 py-0.5 rounded-full bg-muted/40 border border-border/20">
                                    {t("documents.badge")}
                                  </span>
                                )}
                                
                                <div className="flex items-center gap-1">
                                  <Button 
                                    size="icon" 
                                    variant="ghost" 
                                    className="w-8 h-8 rounded-full text-muted-foreground hover:text-foreground"
                                    onClick={(e) => { e.stopPropagation(); handleOpenPreview(doc); }}
                                  >
                                    <Eye className="w-4 h-4" />
                                  </Button>
                                  <Button 
                                    size="icon" 
                                    variant="ghost" 
                                    className="w-8 h-8 rounded-full text-muted-foreground hover:text-destructive"
                                    onClick={(e) => doc.id && doc.file_path && handleDelete(doc.id, doc.file_path, e)}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Quick Tip */}
              <div className="mt-6 p-4 bg-accent/10 rounded-xl border border-accent/20 text-left">
                <p className="text-sm text-foreground">
                  <span className="font-medium">💡 {t("documents.tip")}</span>{" "}
                  {t("documents.tipText")}
                </p>
              </div>
            </div>

            {/* Security Badge */}
            <div className="absolute -bottom-4 -left-4 bg-primary text-primary-foreground px-4 py-2 rounded-xl shadow-lg flex items-center gap-2 animate-float">
              <Shield className="w-5 h-5" />
              <span className="font-medium">{t("documents.encrypted")}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Intelligent Preview Dialog Modal (Polished Hierarchy Layout) */}
      <Dialog open={!!previewDoc} onOpenChange={(open) => !open && setPreviewDoc(null)}>
        <DialogContent className="max-w-xl overflow-y-auto max-h-[90vh] p-6 border-none bg-card/95 backdrop-blur-md shadow-2xl rounded-2xl">
          {previewDoc && (
            <div className="flex flex-col gap-5 text-left">
              <DialogHeader className="border-b border-border/50 pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    {getDocumentIcon(previewDoc.document_type)}
                  </div>
                  <div className="text-left min-w-0">
                    <DialogTitle className="text-lg font-bold text-foreground truncate">
                      {previewDoc.name}
                    </DialogTitle>
                    <DialogDescription className="text-xs text-muted-foreground truncate">
                      {previewDoc.file_size_mb} MB • Uploaded {previewDoc.created_at ? new Date(previewDoc.created_at).toLocaleDateString() : ""}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              {/* Hierarchical Preview Layout */}
              
              {/* 1. Document Preview */}
              <div className="flex flex-col gap-2">
                <span className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
                  <Eye className="w-3.5 h-3.5" />
                  Document Preview
                </span>
                <div className="w-full h-48 bg-muted/30 border border-border/50 rounded-xl flex items-center justify-center overflow-hidden relative shadow-inner">
                  {loadingUrl ? (
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  ) : previewUrl ? (
                    previewDoc.name.toLowerCase().endsWith(".pdf") ? (
                      <iframe 
                        src={previewUrl} 
                        title="PDF Preview"
                        className="w-full h-full border-none"
                      />
                    ) : (
                      <img 
                        src={previewUrl} 
                        alt="Document Preview"
                        className="w-full h-full object-contain animate-fade-in"
                      />
                    )
                  ) : (
                    <div className="text-center p-4">
                      <FileText className="w-10 h-10 text-muted-foreground/60 mx-auto mb-2" />
                      <span className="text-xs text-muted-foreground">Preview unavailable</span>
                    </div>
                  )}
                </div>
              </div>

              {/* 2. AI Summary */}
              {previewDoc.ai_summary && (
                <div className="p-3.5 bg-primary/5 border border-primary/15 rounded-xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-16 h-16 bg-primary/5 rounded-full -mr-4 -mt-4 pointer-events-none" />
                  <h4 className="text-[10px] uppercase font-bold text-primary flex items-center gap-1 mb-1">
                    <Sparkles className="w-3.5 h-3.5" />
                    AI Summary
                  </h4>
                  <p className="text-xs text-foreground/90 font-medium leading-normal italic">
                    "{previewDoc.ai_summary}"
                  </p>
                </div>
              )}

              {/* 3. Metadata Grid */}
              <div>
                <h4 className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1 mb-1.5">
                  <BookOpen className="w-3.5 h-3.5" />
                  Extracted Metadata
                </h4>
                <div className="grid grid-cols-2 gap-3 p-3.5 bg-muted/40 border border-border/50 rounded-xl text-xs">
                  <div className="col-span-2 flex items-start gap-2 border-b border-border/30 pb-2">
                    <User className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    <div>
                      <span className="text-[9px] font-bold text-muted-foreground uppercase block mb-0.5">Holder Name</span>
                      <span className="font-semibold text-foreground">{previewDoc.metadata?.full_name || "—"}</span>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-2 border-b border-border/30 pb-2">
                    <CreditCard className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    <div>
                      <span className="text-[9px] font-bold text-muted-foreground uppercase block mb-0.5">ID Number</span>
                      <span className="font-semibold text-foreground truncate max-w-[130px] block">{previewDoc.metadata?.document_number || "—"}</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-2 border-b border-border/30 pb-2">
                    <Building className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    <div>
                      <span className="text-[9px] font-bold text-muted-foreground uppercase block mb-0.5">Authority</span>
                      <span className="font-semibold text-foreground truncate max-w-[130px] block">{previewDoc.metadata?.issuing_authority || "—"}</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    <div>
                      <span className="text-[9px] font-bold text-muted-foreground uppercase block mb-0.5">Issue Date</span>
                      <span className="font-semibold text-foreground">{previewDoc.metadata?.dob_or_issuance || "—"}</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    <div>
                      <span className="text-[9px] font-bold text-muted-foreground uppercase block mb-0.5">Expiry Date</span>
                      <span className="font-semibold text-foreground">{previewDoc.metadata?.expiry_date || "—"}</span>
                    </div>
                  </div>

                  {previewDoc.metadata?.address && (
                    <div className="col-span-2 border-t border-border/30 pt-2 flex items-start gap-2">
                      <Home className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                      <div>
                        <span className="text-[9px] font-bold text-muted-foreground uppercase block mb-0.5">Address</span>
                        <span className="font-semibold text-foreground leading-snug">{previewDoc.metadata?.address}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 4. OCR Text */}
              {previewDoc.extracted_text && (
                <div>
                  <h4 className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1 mb-1.5">
                    <FileText className="w-3.5 h-3.5" />
                    OCR Transcript
                  </h4>
                  <div className="max-h-24 overflow-y-auto p-3 bg-muted/60 border border-border/40 rounded-xl text-[11px] font-mono whitespace-pre-wrap leading-relaxed text-muted-foreground">
                    {previewDoc.extracted_text}
                  </div>
                </div>
              )}

              {/* 5. Download / Action links inside Footer */}
              <DialogFooter className="border-t border-border/50 pt-4 gap-2 sm:gap-0">
                <Button 
                  variant="destructive" 
                  size="sm" 
                  className="gap-1.5 mr-auto text-xs"
                  onClick={(e) => previewDoc.id && previewDoc.file_path && handleDelete(previewDoc.id, previewDoc.file_path, e)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </Button>
                {previewUrl && (
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs mr-2" asChild>
                    <a href={previewUrl} target="_blank" rel="noreferrer">
                      <ExternalLink className="w-3.5 h-3.5" />
                      Download / View Full
                    </a>
                  </Button>
                )}
                <Button variant="outline" size="sm" className="text-xs" onClick={() => setPreviewDoc(null)}>
                  Close
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
