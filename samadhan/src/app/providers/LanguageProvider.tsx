import { createContext, useContext, useState, ReactNode } from "react";
import { logger } from "@/shared/services/logger";

type Language = "en" | "hi";

interface Translations {
  [key: string]: {
    en: string;
    hi: string;
  };
}

export const translations: Translations = {
  // Header
  "nav.dashboard": { en: "Dashboard", hi: "डैशबोर्ड" },
  "nav.report": { en: "Report Issue", hi: "समस्या दर्ज करें" },
  "nav.map": { en: "Civic Map", hi: "नागरिक मानचित्र" },
  "nav.schemes": { en: "Schemes", hi: "योजनाएं" },
  "nav.analyzer": { en: "Form Analyzer", hi: "फॉर्म विश्लेषक" },
  "nav.documents": { en: "Documents", hi: "दस्तावेज़" },
  "nav.signin": { en: "Sign In", hi: "साइन इन" },
  "nav.signup": { en: "Sign Up", hi: "साइन अप" },
  
  // Hero Section
  "hero.badge": { en: "AI-Powered Civic Governance Platform", hi: "AI-संचालित नागरिक शासन मंच" },
  "hero.title1": { en: "Your Voice,", hi: "आपकी आवाज़," },
  "hero.title2": { en: "Your City,", hi: "आपका शहर," },
  "hero.title3": { en: "Your", hi: "आपका" },
  "hero.subtitle": { 
    en: "Report civic issues, access government schemes, and get AI-powered assistance for all your civic needs—in your language, with your voice.",
    hi: "नागरिक समस्याओं की रिपोर्ट करें, सरकारी योजनाओं का लाभ उठाएं, और अपनी भाषा में AI-संचालित सहायता प्राप्त करें।"
  },
  "hero.reportIssue": { en: "Report an Issue", hi: "समस्या दर्ज करें" },
  "hero.exploreSchemes": { en: "Explore Schemes", hi: "योजनाएं देखें" },
  "hero.speakNow": { en: "Speak Now", hi: "बोलें" },
  "hero.issuesNearYou": { en: "Issues Near You", hi: "आपके पास की समस्याएं" },
  "hero.issuesDesc": { en: "See and support problems in your area", hi: "अपने क्षेत्र की समस्याओं को देखें और समर्थन करें" },
  "hero.formAnalyzer": { en: "Form Analyzer", hi: "फॉर्म विश्लेषक" },
  "hero.formDesc": { en: "AI explains any government form", hi: "AI किसी भी सरकारी फॉर्म को समझाता है" },
  "hero.verifiedSchemes": { en: "Verified Schemes", hi: "सत्यापित योजनाएं" },
  "hero.schemesDesc": { en: "Check eligibility for benefits", hi: "लाभों के लिए पात्रता जांचें" },
  "hero.issuesResolved": { en: "Issues Resolved", hi: "समस्याएं हल" },
  "hero.activeCitizens": { en: "Active Citizens", hi: "सक्रिय नागरिक" },
  "hero.avgResponse": { en: "Avg Response", hi: "औसत प्रतिक्रिया" },

  // Issues Section
  "issues.badge": { en: "Near Your Location", hi: "आपके स्थान के पास" },
  "issues.title": { en: "Issues Near You", hi: "आपके पास की समस्याएं" },
  "issues.subtitle": { en: "Support problems affecting your community. Together, we make change happen.", hi: "अपने समुदाय की समस्याओं का समर्थन करें। साथ मिलकर बदलाव लाएं।" },
  "issues.viewAll": { en: "View All Issues", hi: "सभी समस्याएं देखें" },
  "issues.activeIssues": { en: "Active Issues", hi: "सक्रिय समस्याएं" },
  "issues.resolved": { en: "Resolved", hi: "हल" },
  "issues.avgResponseTime": { en: "Avg. Response", hi: "औसत प्रतिक्रिया" },
  "issues.communitySupports": { en: "Community Supports", hi: "सामुदायिक समर्थन" },
  "issues.support": { en: "Support", hi: "समर्थन" },
  "issues.reported": { en: "Reported", hi: "रिपोर्ट की गई" },
  "issues.inProgress": { en: "In Progress", hi: "प्रगति में" },
  "issues.away": { en: "away", hi: "दूर" },

  // Schemes Section
  "schemes.badge": { en: "Verified Policies", hi: "सत्यापित नीतियां" },
  "schemes.title": { en: "Government Schemes For You", hi: "आपके लिए सरकारी योजनाएं" },
  "schemes.subtitle": { en: "Personalized recommendations based on your profile. Never miss a benefit you're eligible for.", hi: "आपकी प्रोफ़ाइल के आधार पर व्यक्तिगत अनुशंसाएं। कोई भी पात्र लाभ न चूकें।" },
  "schemes.eligible": { en: "Eligible Schemes", hi: "पात्र योजनाएं" },
  "schemes.eligibleDesc": { en: "You may be eligible for 3 schemes based on your profile", hi: "आपकी प्रोफ़ाइल के आधार पर 3 योजनाओं के लिए पात्र हो सकते हैं" },
  "schemes.checkEligibility": { en: "Check Eligibility", hi: "पात्रता जांचें" },
  "schemes.deadline": { en: "Deadline", hi: "अंतिम तिथि" },
  "schemes.trustScore": { en: "Trust Score", hi: "विश्वास स्कोर" },
  "schemes.learnMore": { en: "Learn More", hi: "और जानें" },
  "schemes.mayBeEligible": { en: "You may be eligible", hi: "आप पात्र हो सकते हैं" },
  "schemes.fakeWarning": { en: "Beware of Fake Policies", hi: "नकली नीतियों से सावधान रहें" },
  "schemes.fakeDesc": { en: "Only trust verified sources. Report suspicious schemes.", hi: "केवल सत्यापित स्रोतों पर भरोसा करें। संदिग्ध योजनाओं की रिपोर्ट करें।" },
  "schemes.reportFake": { en: "Report Fake Policy", hi: "नकली नीति की रिपोर्ट करें" },

  // Form Analyzer Section
  "analyzer.badge": { en: "Key Feature", hi: "मुख्य विशेषता" },
  "analyzer.title": { en: "AI Form Analyzer with", hi: "AI फॉर्म विश्लेषक" },
  "analyzer.audioGuidance": { en: "Audio Guidance", hi: "ऑडियो मार्गदर्शन" },
  "analyzer.subtitle": { en: "Upload any government form and get instant, simple explanations with voice narration. Never struggle with complex forms again.", hi: "कोई भी सरकारी फॉर्म अपलोड करें और वॉइस नैरेशन के साथ तुरंत सरल स्पष्टीकरण प्राप्त करें।" },
  "analyzer.uploadAnyForm": { en: "Upload Any Form", hi: "कोई भी फॉर्म अपलोड करें" },
  "analyzer.uploadDesc": { en: "PDF, image, or link to any government form", hi: "PDF, छवि, या किसी भी सरकारी फॉर्म का लिंक" },
  "analyzer.aiAnalysis": { en: "AI Analysis", hi: "AI विश्लेषण" },
  "analyzer.analysisDesc": { en: "Instant explanation of purpose and requirements", hi: "उद्देश्य और आवश्यकताओं की तुरंत व्याख्या" },
  "analyzer.audioGuide": { en: "Audio Guidance", hi: "ऑडियो मार्गदर्शन" },
  "analyzer.audioDesc": { en: "Listen to step-by-step instructions in your language", hi: "अपनी भाषा में चरण-दर-चरण निर्देश सुनें" },
  "analyzer.askQuestions": { en: "Ask Questions", hi: "प्रश्न पूछें" },
  "analyzer.questionsDesc": { en: "Get answers about any field or requirement", hi: "किसी भी फ़ील्ड या आवश्यकता के बारे में उत्तर प्राप्त करें" },
  "analyzer.uploadForm": { en: "Upload a Form", hi: "फॉर्म अपलोड करें" },
  "analyzer.describeForm": { en: "Describe Form", hi: "फॉर्म का वर्णन करें" },
  "analyzer.dropHere": { en: "Drop your form here", hi: "अपना फॉर्म यहां छोड़ें" },
  "analyzer.browseFiles": { en: "Browse Files", hi: "फ़ाइलें ब्राउज़ करें" },
  "analyzer.audioLanguage": { en: "Audio Language", hi: "ऑडियो भाषा" },
  "analyzer.tryAsking": { en: "Try asking:", hi: "पूछने का प्रयास करें:" },
  "analyzer.accessible": { en: "100% Accessible", hi: "100% सुलभ" },

  // AI Assistant Section
  "assistant.badge": { en: "24/7 AI Support", hi: "24/7 AI सहायता" },
  "assistant.title": { en: "Your Personal", hi: "आपका व्यक्तिगत" },
  "assistant.civicAssistant": { en: "Civic Assistant", hi: "नागरिक सहायक" },
  "assistant.subtitle": { en: "Ask anything about civic issues, government schemes, or forms. Get instant answers in Hindi, English, or your preferred language.", hi: "नागरिक समस्याओं, सरकारी योजनाओं या फॉर्म के बारे में कुछ भी पूछें। हिंदी, अंग्रेजी या अपनी पसंदीदा भाषा में तुरंत उत्तर प्राप्त करें।" },
  "assistant.multilingualSupport": { en: "Multilingual Support", hi: "बहुभाषी समर्थन" },
  "assistant.multilingualDesc": { en: "Speak or type in Hindi, English, or regional languages", hi: "हिंदी, अंग्रेजी या क्षेत्रीय भाषाओं में बोलें या टाइप करें" },
  "assistant.voiceInteraction": { en: "Voice Interaction", hi: "वॉइस इंटरैक्शन" },
  "assistant.voiceDesc": { en: "Use voice commands for hands-free assistance", hi: "हैंड्स-फ्री सहायता के लिए वॉइस कमांड का उपयोग करें" },
  "assistant.contextualHelp": { en: "Contextual Help", hi: "संदर्भ सहायता" },
  "assistant.contextualDesc": { en: "Get relevant suggestions based on your queries", hi: "अपनी क्वेरी के आधार पर प्रासंगिक सुझाव प्राप्त करें" },
  "assistant.documentAssistance": { en: "Document Assistance", hi: "दस्तावेज़ सहायता" },
  "assistant.documentDesc": { en: "Help with forms, applications, and document uploads", hi: "फॉर्म, आवेदन और दस्तावेज़ अपलोड में सहायता" },
  "assistant.startChatting": { en: "Start Chatting", hi: "चैट शुरू करें" },
  "assistant.online": { en: "Online • Responds in Hindi & English", hi: "ऑनलाइन • हिंदी और अंग्रेजी में जवाब" },
  "assistant.typePlaceholder": { en: "Type your question...", hi: "अपना प्रश्न टाइप करें..." },

  // Document Locker Section
  "documents.badge": { en: "Secure Storage", hi: "सुरक्षित भंडारण" },
  "documents.title": { en: "Your Digital", hi: "आपका डिजिटल" },
  "documents.locker": { en: "Document Locker", hi: "दस्तावेज़ लॉकर" },
  "documents.subtitle": { en: "Store all your important documents securely. Auto-tagged, always accessible, and ready to attach to any government application.", hi: "अपने सभी महत्वपूर्ण दस्तावेज़ सुरक्षित रूप से संग्रहीत करें। ऑटो-टैग, हमेशा सुलभ।" },
  "documents.bankGrade": { en: "Bank-Grade Security", hi: "बैंक-स्तरीय सुरक्षा" },
  "documents.bankDesc": { en: "End-to-end encryption for all your documents", hi: "आपके सभी दस्तावेज़ों के लिए एंड-टू-एंड एन्क्रिप्शन" },
  "documents.autoTagging": { en: "Smart Auto-Tagging", hi: "स्मार्ट ऑटो-टैगिंग" },
  "documents.autoDesc": { en: "AI automatically categorizes your documents", hi: "AI स्वचालित रूप से आपके दस्तावेज़ों को वर्गीकृत करता है" },
  "documents.expiryReminders": { en: "Expiry Reminders", hi: "समाप्ति अनुस्मारक" },
  "documents.expiryDesc": { en: "Never miss a renewal deadline", hi: "नवीनीकरण की समय सीमा कभी न चूकें" },
  "documents.quickReuse": { en: "Quick Reuse", hi: "त्वरित पुन: उपयोग" },
  "documents.reuseDesc": { en: "Attach documents to any application instantly", hi: "किसी भी आवेदन में तुरंत दस्तावेज़ संलग्न करें" },
  "documents.openLocker": { en: "Open Document Locker", hi: "दस्तावेज़ लॉकर खोलें" },
  "documents.myDocuments": { en: "My Documents", hi: "मेरे दस्तावेज़" },
  "documents.upload": { en: "Upload", hi: "अपलोड" },
  "documents.verified": { en: "Verified", hi: "सत्यापित" },
  "documents.expiresSoon": { en: "Expires Soon", hi: "जल्द समाप्त" },
  "documents.tip": { en: "Tip:", hi: "सुझाव:" },
  "documents.tipText": { en: "Connect your DigiLocker for automatic document sync", hi: "स्वचालित दस्तावेज़ सिंक के लिए अपना DigiLocker कनेक्ट करें" },
  "documents.encrypted": { en: "256-bit Encrypted", hi: "256-बिट एन्क्रिप्टेड" },

  // Auth Pages
  "auth.welcomeBack": { en: "Welcome back", hi: "वापस स्वागत है" },
  "auth.signInContinue": { en: "Sign in to continue to Samadhan", hi: "समाधान में जारी रखने के लिए साइन इन करें" },
  "auth.createAccount": { en: "Create an account", hi: "खाता बनाएं" },
  "auth.joinCommunity": { en: "Join the community making change happen", hi: "बदलाव लाने वाले समुदाय से जुड़ें" },
  "auth.email": { en: "Email", hi: "ईमेल" },
  "auth.password": { en: "Password", hi: "पासवर्ड" },
  "auth.confirmPassword": { en: "Confirm Password", hi: "पासवर्ड की पुष्टि करें" },
  "auth.fullName": { en: "Full Name", hi: "पूरा नाम" },
  "auth.forgotPassword": { en: "Forgot password?", hi: "पासवर्ड भूल गए?" },
  "auth.signIn": { en: "Sign In", hi: "साइन इन" },
  "auth.signUp": { en: "Sign Up", hi: "साइन अप" },
  "auth.noAccount": { en: "Don't have an account?", hi: "खाता नहीं है?" },
  "auth.hasAccount": { en: "Already have an account?", hi: "पहले से खाता है?" },
  "auth.orContinueWith": { en: "Or continue with", hi: "या इसके साथ जारी रखें" },
  "auth.google": { en: "Google", hi: "गूगल" },
  "auth.signingIn": { en: "Signing in...", hi: "साइन इन हो रहा है..." },
  "auth.signingUp": { en: "Signing up...", hi: "साइन अप हो रहा है..." },

  // Footer
  "footer.tagline": { en: "Empowering citizens through technology", hi: "प्रौद्योगिकी के माध्यम से नागरिकों को सशक्त बनाना" },
  "footer.quickLinks": { en: "Quick Links", hi: "त्वरित लिंक" },
  "footer.resources": { en: "Resources", hi: "संसाधन" },
  "footer.departments": { en: "Gov. Departments", hi: "सरकारी विभाग" },
  "footer.helpCenter": { en: "Help Center", hi: "सहायता केंद्र" },
  "footer.faqs": { en: "FAQs", hi: "अक्सर पूछे जाने वाले प्रश्न" },
  "footer.contactUs": { en: "Contact Us", hi: "संपर्क करें" },
  "footer.privacyPolicy": { en: "Privacy Policy", hi: "गोपनीयता नीति" },
  "footer.terms": { en: "Terms of Service", hi: "सेवा की शर्तें" },
  "footer.rights": { en: "All rights reserved.", hi: "सर्वाधिकार सुरक्षित।" },
  "footer.dept.mohua": { en: "Min. of Housing & Urban Affairs", hi: "आवास एवं नगर कार्य मंत्रालय" },
  "footer.dept.jalshakti": { en: "Min. of Jal Shakti", hi: "जल शक्ति मंत्रालय" },
  "footer.dept.power": { en: "Min. of Power", hi: "विद्युत मंत्रालय" },
  "footer.dept.roads": { en: "Min. of Road Transport", hi: "सड़क परिवहन मंत्रालय" },
  "footer.dept.meity": { en: "Min. of Electronics & IT", hi: "इलेक्ट्रॉनिक्स एवं IT मंत्रालय" },
  "footer.dept.panchayat": { en: "Min. of Panchayati Raj", hi: "पंचायती राज मंत्रालय" },
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>("en");

  const t = (key: string): string => {
    const translation = translations[key];
    if (!translation) {
      logger.warn(`Translation missing for key: ${key}`);
      return key;
    }
    return translation[language];
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
