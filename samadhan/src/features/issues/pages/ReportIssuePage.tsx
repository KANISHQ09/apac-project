import { useLanguage } from "@/app/providers/LanguageProvider";
import { useAuth } from "@/features/auth";
import { useReportIssue } from "../hooks/useReportIssue";
import LocationPicker from "../components/LocationPicker";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Textarea } from "@/shared/components/ui/textarea";
import { Label } from "@/shared/components/ui/label";
import {
  MapPin,
  Camera,
  Mic,
  FileText,
  Droplets,
  Trash2,
  Zap,
  Construction,
  TreePine,
  Building2,
  Send,
  Loader2,
  AlertTriangle,
  CheckCircle2
} from "lucide-react";

const categories = [
  { id: "water", icon: Droplets, labelEn: "Water Supply", labelHi: "जल आपूर्ति" },
  { id: "sanitation", icon: Trash2, labelEn: "Sanitation", labelHi: "स्वच्छता" },
  { id: "electricity", icon: Zap, labelEn: "Electricity", labelHi: "बिजली" },
  { id: "roads", icon: Construction, labelEn: "Roads", labelHi: "सड़कें" },
  { id: "parks", icon: TreePine, labelEn: "Parks & Gardens", labelHi: "पार्क और बगीचे" },
  { id: "buildings", icon: Building2, labelEn: "Buildings", labelHi: "भवन" },
];

export default function ReportIssuePage() {
  const { language } = useLanguage();
  const { user } = useAuth();
  
  const {
    title,
    setTitle,
    description,
    setDescription,
    location,
    setLocation,
    latitude,
    setLatitude,
    longitude,
    setLongitude,
    geocodeStatus,
    setGeocodeStatus,
    selectedCategory,
    setSelectedCategory,
    isSubmitting,
    errors,
    imagePreview,
    annotatedImage,
    detecting,
    detectedClasses,
    handleImageChange,
    handleSubmit,
    // AI Vision Telemetry
    aiConfidence,
    aiReason,
    aiRisk,
    aiPriority,
    aiProvider,
    aiModel,
    aiCategory,
    aiSupportingDepartments,
    aiRequiresMultipleDepartments,
    aiEstimatedResponseTime,
    aiDetectionTimeMs,
    // Voice
    isRecording,
    interimTranscript,
    toggleVoice,
  } = useReportIssue(user, language);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-secondary/10 rounded-full text-secondary text-sm font-medium mb-4">
            <FileText className="w-4 h-4" />
            {language === "en" ? "Report a Civic Issue" : "नागरिक समस्या की रिपोर्ट करें"}
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
            {language === "en" ? "Report an Issue" : "समस्या दर्ज करें"}
          </h1>
          <p className="text-muted-foreground">
            {language === "en" 
              ? "Help improve your community by reporting civic issues." 
              : "नागरिक समस्याओं की रिपोर्ट करके अपने समुदाय को बेहतर बनाने में मदद करें।"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Category Selection */}
          <div>
            <Label className="text-base mb-4 block">
              {language === "en" ? "Select Category" : "श्रेणी चुनें"} *
            </Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`p-4 rounded-xl border-2 transition-all text-left ${
                    selectedCategory === cat.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <cat.icon className={`w-6 h-6 mb-2 ${
                    selectedCategory === cat.id ? "text-primary" : "text-muted-foreground"
                  }`} />
                  <p className="font-medium text-sm">
                    {language === "en" ? cat.labelEn : cat.labelHi}
                  </p>
                </button>
              ))}
            </div>
            {errors.category && (
              <p className="text-sm text-destructive mt-2">{errors.category}</p>
            )}
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">
              {language === "en" ? "Issue Title" : "समस्या का शीर्षक"} *
            </Label>
            <Input
              id="title"
              placeholder={language === "en" ? "Brief description of the issue" : "समस्या का संक्षिप्त विवरण"}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
            />
            {errors.title && (
              <p className="text-sm text-destructive">{errors.title}</p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">
              {language === "en" ? "Detailed Description" : "विस्तृत विवरण"} *
            </Label>
            <Textarea
              id="description"
              placeholder={language === "en" ? "Provide more details about the issue..." : "समस्या के बारे में अधिक जानकारी दें..."}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              maxLength={2000}
            />
            {errors.description && (
              <p className="text-sm text-destructive">{errors.description}</p>
            )}
          </div>

          {/* Location Picker Section */}
          <div className="space-y-3">
            <LocationPicker
              location={location}
              latitude={latitude}
              longitude={longitude}
              onChange={(address, lat, lng) => {
                setLocation(address);
                setLatitude(lat);
                setLongitude(lng);
              }}
              geocodeStatus={geocodeStatus}
              setGeocodeStatus={setGeocodeStatus}
              language={language}
            />
            {errors.location && (
              <p className="text-sm text-destructive mt-1">{errors.location}</p>
            )}
          </div>

          {/* Photo Upload + Detection */}
          <div className="space-y-2">
            <Label>
              {language === "en" ? "Add Photo or Video (AI Detection)" : "फोटो या वीडियो जोड़ें (AI पहचान)"}
            </Label>
            <label className="block border-2 border-dashed border-border rounded-xl p-6 text-center hover:border-primary/50 transition-colors cursor-pointer">
              <input type="file" accept="image/*,video/*" className="hidden" onChange={handleImageChange} />
              {imagePreview ? (
                <img src={annotatedImage || imagePreview} alt="preview" className="max-h-64 mx-auto rounded-lg" />
              ) : (
                <>
                  <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto mb-3">
                    <Camera className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground mb-1">
                    {language === "en" 
                      ? "Upload image or video for AI detection" 
                      : "AI पहचान के लिए छवि या वीडियो अपलोड करें"}
                  </p>
                  <p className="text-xs text-muted-foreground mb-2">
                    PNG • JPG • MP4 • MOV • WEBM
                  </p>
                  <p className="text-[10px] text-muted-foreground max-w-xs mx-auto leading-relaxed">
                    {language === "en"
                      ? "Videos are analyzed by extracting a representative frame. Videos are never stored."
                      : "एक प्रतिनिधि फ्रेम निकालकर वीडियो का विश्लेषण किया जाता है। वीडियो कभी भी संग्रहीत नहीं किए जाते हैं।"}
                  </p>
                </>
              )}
            </label>
            {detecting && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                {language === "en" ? "Performing secure AI analysis..." : "सुरक्षित एआई विश्लेषण किया जा रहा है..."}
              </div>
            )}
            {imagePreview && !detecting && detectedClasses.length === 0 && (
              <div className="mt-4 p-4 rounded-xl border border-amber-200 bg-amber-50/50 space-y-2 text-xs">
                <div className="flex items-center gap-2 text-amber-800 font-semibold">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span>
                    {language === "en" ? "Analysis Limit Reached" : "विश्लेषण सीमा समाप्त"}
                  </span>
                </div>
                <p className="text-amber-700 leading-relaxed font-medium">
                  {language === "en"
                    ? "We couldn't confidently identify the issue. Possible categories: Roads, Water, Buildings. Please select the closest one."
                    : "हम विश्वासपूर्वक समस्या की पहचान नहीं कर सके। संभावित श्रेणियां: सड़कें, पानी, इमारतें। कृपया निकटतम श्रेणी चुनें।"}
                </p>
              </div>
            )}
            {detectedClasses.length > 0 && (
              <div className="mt-4 p-4 rounded-xl border border-blue-100 bg-blue-50/30 space-y-3">
                <div className="flex items-center gap-2 border-b border-blue-100/50 pb-2.5">
                  <CheckCircle2 className="w-5 h-5 text-primary" />
                  <span className="font-semibold text-sm text-foreground">
                    {language === "en" ? "AI Assessment" : "एआई मूल्यांकन"}
                  </span>
                </div>
                
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                  <div>
                    <span className="text-muted-foreground block mb-0.5">
                      {language === "en" ? "Detected Issue" : "पहचानी गई समस्या"}
                    </span>
                    <span className="font-semibold text-foreground capitalize">
                      {detectedClasses[0] || "Civic Hazard"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block mb-0.5">
                      {language === "en" ? "Confidence" : "विश्वास स्तर"}
                    </span>
                    <span className={`font-semibold ${aiConfidence && aiConfidence < 0.75 ? "text-amber-600" : "text-emerald-600"}`}>
                      {aiConfidence ? `${Math.round(aiConfidence * 100)}%` : "85%"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block mb-0.5">
                      {language === "en" ? "Responsible Department" : "जिम्मेदार विभाग"}
                    </span>
                    <span className="font-medium text-foreground">
                      {aiCategory || "General Municipal Services"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block mb-0.5">
                      {language === "en" ? "Estimated Response Time" : "अनुमानित प्रतिक्रिया समय"}
                    </span>
                    <span className="font-medium text-foreground">
                      {aiEstimatedResponseTime || "2-3 days"}
                    </span>
                  </div>
                </div>

                {aiSupportingDepartments && aiSupportingDepartments.length > 0 && (
                  <div className="text-xs">
                    <span className="text-muted-foreground block mb-0.5">
                      {language === "en" ? "Supporting Departments" : "सहायक विभाग"}
                    </span>
                    <span className="font-medium text-foreground">
                      {aiSupportingDepartments.join(", ")}
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-2 border-t border-blue-100/50 pt-2.5 text-xs">
                  {aiPriority && (
                    <div>
                      <span className="text-muted-foreground block mb-0.5">
                        {language === "en" ? "Priority" : "प्राथमिकता"}
                      </span>
                      <div>
                        <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold tracking-wide ${
                          aiPriority === "CRITICAL" ? "bg-red-100 text-red-800" :
                          aiPriority === "HIGH" ? "bg-amber-100 text-amber-800" :
                          "bg-blue-100 text-blue-800"
                        }`}>
                          {aiPriority}
                        </span>
                      </div>
                    </div>
                  )}

                  {aiRisk && (
                    <div>
                      <span className="text-muted-foreground block mb-0.5">
                        {language === "en" ? "Citizen Risk" : "नागरिक जोखिम"}
                      </span>
                      <p className="text-foreground leading-relaxed font-medium">{aiRisk}</p>
                    </div>
                  )}

                  {aiReason && (
                    <div>
                      <span className="text-muted-foreground block mb-0.5">
                        {language === "en" ? "Recommended Action" : "अनुशंसित कार्रवाई"}
                      </span>
                      <p className="text-foreground leading-relaxed font-medium">{aiReason}</p>
                    </div>
                  )}
                </div>

                {aiConfidence && aiConfidence < 0.75 && (
                  <div className="flex gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs mt-1">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                    <div>
                      <p className="font-semibold">
                        {language === "en" ? "Review Recommended" : "समीक्षा की सिफारिश"}
                      </p>
                      <p className="mt-0.5 leading-relaxed">
                        {language === "en"
                          ? "The AI confidence is low. Please manually verify categories and description before submitting."
                          : "एआई विश्वास स्तर कम है। सबमिट करने से पहले कृपया श्रेणियों और विवरण को मैन्युअल रूप से सत्यापित करें।"}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Voice Description */}
          <div className={`rounded-xl p-4 border-2 transition-all ${
            isRecording
              ? "bg-destructive/5 border-destructive/40"
              : "bg-muted/50 border-transparent"
          }`}>
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="font-medium text-sm">
                  {language === "en" ? "Or describe by voice" : "या आवाज़ से बताएं"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {isRecording
                    ? (language === "en" ? "Listening... tap to stop" : "सुन रहे हैं... रोकने के लिए टैप करें")
                    : (language === "en" ? "Tap to record your issue description" : "समस्या का विवरण रिकॉर्ड करने के लिए टैप करें")}
                </p>
              </div>
              <Button
                type="button"
                variant={isRecording ? "destructive" : "outline"}
                size="icon"
                onClick={toggleVoice}
                className={isRecording ? "animate-pulse" : ""}
                aria-label={isRecording ? "Stop recording" : "Start voice recording"}
              >
                <Mic className="w-5 h-5" />
              </Button>
            </div>
            {/* Interim transcript preview */}
            {isRecording && interimTranscript && (
              <p className="text-sm text-muted-foreground italic mt-1 px-1">
                &ldquo;{interimTranscript}&rdquo;
              </p>
            )}
          </div>

          {/* Submit */}
          <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {language === "en" ? "Submitting..." : "सबमिट हो रहा है..."}
              </>
            ) : (
              <>
                <Send className="w-5 h-5" />
                {language === "en" ? "Submit Report" : "रिपोर्ट सबमिट करें"}
              </>
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
