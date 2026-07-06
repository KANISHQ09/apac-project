import { useState, useRef, useCallback } from "react";
import { User } from "@supabase/supabase-js";
import { useNavigate } from "react-router-dom";
import { gamificationService } from "../../profile/services/gamificationService";
import { useToast } from "@/shared/hooks/use-toast";
import { reportIssueSchema } from "../validation/reportIssueSchema";
import { issueService } from "../services/issueService";
import { visionService } from "../services/visionService";
import { logger } from "@/shared/services/logger";
import { ROUTES } from "@/shared/config/routes";
import { validateFileSignature } from "@/shared/validation/magicBytes";
import { voiceService } from "@/shared/services/voiceService";

const detectionToCategory = (cls: string): string | null => {
  const c = cls.toLowerCase();
  if (c.includes("pothole")) return "roads";
  if (c.includes("garbage") || c.includes("trash") || c.includes("waste")) return "sanitation";
  if (c.includes("civic")) return "buildings";
  return null;
};

const extractFrameFromVideo = async (file: File, seekTimeSeconds: number = 1.5): Promise<File> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;

    const objectUrl = URL.createObjectURL(file);
    video.src = objectUrl;

    video.onloadedmetadata = () => {
      const targetTime = Math.min(seekTimeSeconds, video.duration);
      video.currentTime = targetTime;
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Failed to get 2D canvas context"));
          return;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error("Failed to export canvas to Blob"));
            return;
          }
          const frameFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + "_frame.jpg", {
            type: "image/jpeg",
            lastModified: Date.now(),
          });
          resolve(frameFile);
          URL.revokeObjectURL(objectUrl);
          // Free video element resources
          video.src = "";
          video.load();
        }, "image/jpeg", 0.9);
      } catch (err) {
        reject(err);
        URL.revokeObjectURL(objectUrl);
        video.src = "";
        video.load();
      }
    };

    video.onerror = () => {
      reject(new Error("Error loading video: " + (video.error?.message || "Unknown error")));
      URL.revokeObjectURL(objectUrl);
      video.src = "";
      video.load();
    };
  });
};

export function useReportIssue(user: User | null, activeLanguage: "en" | "hi") {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  
  // Coordinates and Address state updated by LocationPicker component
  const [location, setLocation] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [geocodeStatus, setGeocodeStatus] = useState<"idle" | "resolving" | "success" | "failed">("idle");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [annotatedImage, setAnnotatedImage] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [detectedClasses, setDetectedClasses] = useState<string[]>([]);
  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const stopListeningRef = useRef<(() => void) | null>(null);

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 1. File size verification (10MB)
    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      toast({
        title: activeLanguage === "en" ? "File too large" : "फ़ाइल बहुत बड़ी है",
        description: activeLanguage === "en" ? "Max file size is 10MB" : "अधिकतम फ़ाइल आकार 10MB है",
        variant: "destructive",
      });
      return;
    }

    // 2. MIME type & extension checks
    const ALLOWED_IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    const ALLOWED_VIDEO_MIMES = ["video/mp4", "video/quicktime", "video/webm"];
    const extension = file.name.split(".").pop()?.toLowerCase();
    const isVideo = ALLOWED_VIDEO_MIMES.includes(file.type) || ["mp4", "mov", "webm"].includes(extension || "");

    let processedFile = file;

    if (isVideo) {
      setDetecting(true);
      try {
        processedFile = await extractFrameFromVideo(file);
      } catch (err: any) {
        logger.error("Video frame extraction failed:", err);
        toast({
          title: activeLanguage === "en" ? "Video analysis failed" : "वीडियो विश्लेषण विफल",
          description: activeLanguage === "en" ? "Could not extract a frame from this video." : "इस वीडियो से फ्रेम नहीं निकाला जा सका।",
          variant: "destructive",
        });
        setDetecting(false);
        return;
      }
    } else {
      // MIME type verification
      if (!ALLOWED_IMAGE_MIMES.includes(file.type)) {
        toast({
          title: activeLanguage === "en" ? "Unsupported file type" : "असमर्थित फ़ाइल प्रकार",
          description: activeLanguage === "en" 
            ? "Only JPG, PNG, WEBP, GIF, MP4, MOV, and WEBM files are allowed" 
            : "केवल JPG, PNG, WEBP, GIF, MP4, MOV, और WEBM फाइलों की अनुमति है",
          variant: "destructive",
        });
        return;
      }

      // Magic Byte signature check
      const isValidSignature = await validateFileSignature(file, ALLOWED_IMAGE_MIMES);
      if (!isValidSignature) {
        toast({
          title: activeLanguage === "en" ? "Invalid Image File" : "अवैध छवि फ़ाइल",
          description: activeLanguage === "en" 
            ? "File header does not match its extension. Upload rejected for security reasons." 
            : "फ़ाइल हेडर इसके एक्सटेंशन से मेल नहीं खाता है। सुरक्षा कारणों से अपलोड अस्वीकार कर दिया गया।",
          variant: "destructive",
        });
        return;
      }
    }

    setImageFile(processedFile);
    setAnnotatedImage(null);
    setDetectedClasses([]);

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setImagePreview(dataUrl);
      const base64 = dataUrl.split(",")[1];

      setDetecting(true);
      try {
        const result = await visionService.analyseImage({
          base64Image: base64,
          mimeType: processedFile.type as any,
        });
        if (result.classes.length) {
          setDetectedClasses(result.classes);
          if (result.annotatedImage) {
            setAnnotatedImage(`data:image/jpeg;base64,${result.annotatedImage}`);
          }
          const mapped = detectionToCategory(result.top);
          if (mapped) setSelectedCategory(mapped);
          toast({
            title: activeLanguage === "en" ? "Detection complete" : "पहचान पूर्ण",
            description: activeLanguage === "en"
              ? `Detected: ${result.classes.join(", ")} (Severity: ${result.severityLabel.toUpperCase()})`
              : `पाया गया: ${result.classes.join(", ")} (तीव्रता: ${result.severityLabel.toUpperCase()})`,
          });
        } else {
          toast({
            title: activeLanguage === "en" ? "No issues detected" : "कोई समस्या नहीं मिली",
            description: activeLanguage === "en" ? "Please select a category manually." : "कृपया श्रेणी मैन्युअल रूप से चुनें।",
          });
        }
      } catch (err: any) {
        logger.error("Detection failed:", err);
        toast({
          title: activeLanguage === "en" ? "Detection failed" : "पहचान विफल",
          description: err.message || "An error occurred during AI analysis.",
          variant: "destructive",
        });
      } finally {
        setDetecting(false);
      }
    };
    reader.readAsDataURL(processedFile);
  };

  /**
   * Toggles voice recognition on/off.
   * When turned on: starts listening and appends the final transcript to description.
   * When turned off: stops the recognition session.
   */
  const toggleVoice = useCallback(() => {
    if (isRecording) {
      // Stop recording
      stopListeningRef.current?.();
      stopListeningRef.current = null;
      setIsRecording(false);
      setInterimTranscript("");
      return;
    }

    if (!voiceService.isSupported()) {
      toast({
        title: activeLanguage === "en" ? "Not Supported" : "समर्थित नहीं",
        description:
          activeLanguage === "en"
            ? "Voice input is not supported in this browser. Please use Chrome or Edge."
            : "इस ब्राउज़र में वॉइस इनपुट समर्थित नहीं है। कृपया Chrome या Edge का उपयोग करें।",
        variant: "destructive",
      });
      return;
    }

    setIsRecording(true);
    setInterimTranscript("");

    const stop = voiceService.startListening({
      language: activeLanguage,
      onTranscript: (text, isFinal) => {
        if (isFinal) {
          // Append final result to description with a space separator
          setDescription((prev) =>
            prev ? `${prev.trimEnd()} ${text}` : text
          );
          setInterimTranscript("");
        } else {
          setInterimTranscript(text);
        }
      },
      onError: (errorMsg) => {
        logger.error("Voice recognition error:", errorMsg);
        toast({
          title: activeLanguage === "en" ? "Voice Error" : "वॉइस त्रुटि",
          description: errorMsg,
          variant: "destructive",
        });
        setIsRecording(false);
        setInterimTranscript("");
      },
      onEnd: () => {
        setIsRecording(false);
        setInterimTranscript("");
      },
    });

    stopListeningRef.current = stop;
  }, [isRecording, activeLanguage, toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    if (!user) {
      toast({
        title: activeLanguage === "en" ? "Sign in Required" : "साइन इन आवश्यक",
        description: activeLanguage === "en" ? "Please sign in to report an issue." : "समस्या दर्ज करने के लिए कृपया साइन इन करें।",
        variant: "destructive",
      });
      navigate(ROUTES.SIGN_IN);
      return;
    }

    const validationResult = reportIssueSchema.safeParse({
      title,
      description,
      category: selectedCategory || "",
      location,
    });

    if (!validationResult.success) {
      const fieldErrors: Record<string, string> = {};
      validationResult.error.errors.forEach((err) => {
        if (err.path[0]) {
          fieldErrors[err.path[0] as string] = err.message;
        }
      });
      setErrors(fieldErrors);
      return;
    }

    setIsSubmitting(true);

    try {
      await issueService.reportNewIssue(
        user.id,
        {
          ...(validationResult.data as { title: string; description: string; category: string; location: string }),
          latitude,
          longitude,
        },
        imageFile,
        activeLanguage
      );

      gamificationService.dispatchGamificationUpdate();

      toast({
        title: activeLanguage === "en" ? "Issue Reported!" : "समस्या दर्ज!",
        description: activeLanguage === "en" 
          ? "Your issue has been submitted successfully. The community can now support it." 
          : "आपकी समस्या सफलतापूर्वक दर्ज की गई है। समुदाय अब इसका समर्थन कर सकता है।",
      });

      navigate(ROUTES.DASHBOARD);
    } catch (error: any) {
      logger.error("Failed to report issue:", error);
      toast({
        title: activeLanguage === "en" ? "Error" : "त्रुटि",
        description: error.message || "Failed to submit issue report.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
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
    // Voice
    isRecording,
    interimTranscript,
    toggleVoice,
  };
}
