/**
 * visionService.ts
 * ----------------
 * Frontend Vision Pipeline — Multimodal Image Analysis.
 *
 * This service provides a thin frontend client that:
 *  1. Preprocesses and scales an uploaded image or video frame.
 *  2. Sends it to the AI vision endpoint with strict timeouts.
 *  3. Returns structured civic-issue metadata.
 */

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export interface VisionDetectionResult {
  /** Top-confidence detected class (e.g. "pothole", "garbage") */
  top: string;
  /** All detected class labels, ranked by confidence ranking */
  classes: string[];
  /** Estimated severity 1–5 (5 = critical) */
  severity: number;
  /** Human-readable severity label */
  severityLabel: "low" | "medium" | "high" | "critical";
  /** Optional base64-encoded JPEG with bounding box annotations */
  annotatedImage: string | null;
  /** Raw confidence scores keyed by class name */
  confidences: Record<string, number>;
  confidence?: number;
  reason?: string;
  potentialRisk?: string;
  recommendedPriority?: string;
  provider?: string;
  issueTitle?: string;
  category?: string;
  department?: string;
  supportingDepartments?: string[];
  requiresMultipleDepartments?: boolean;
  estimatedResponseTime?: string;
  latencyMs?: number;
}

export interface VisionAnalysisOptions {
  /** Base64-encoded image data (without data URI prefix) */
  base64Image: string;
  /** MIME type of the image */
  mimeType?: "image/jpeg" | "image/png" | "image/webp";
}

// --------------------------------------------------------------------------
// Constants
// --------------------------------------------------------------------------

/** Known civic-issue categories and their display names */
const CIVIC_CLASS_MAP: Record<string, string> = {
  pothole:      "Pothole",
  garbage:      "Garbage / Waste",
  trash:        "Garbage / Waste",
  waste:        "Garbage / Waste",
  flooding:     "Flooding",
  waterlogging: "Waterlogging",
  streetlight:  "Street Light Outage",
  graffiti:     "Graffiti / Vandalism",
  crack:        "Road Crack",
  debris:       "Debris / Blockage",
  civic:        "Civic Infrastructure",
  drain:        "Drainage Issue",
  sewer:        "Sewer / Sanitation",
};

/** Maps detected class to severity score */
function estimateSeverity(classes: string[]): number {
  const HIGH_SEVERITY   = ["flooding", "waterlogging", "sewer", "pothole"];
  const MEDIUM_SEVERITY = ["garbage", "trash", "waste", "debris", "crack"];
  const LOW_SEVERITY    = ["graffiti", "streetlight", "drain", "civic"];

  let maxScore = 1;
  for (const cls of classes) {
    const lower = cls.toLowerCase();
    if (HIGH_SEVERITY.some((k) => lower.includes(k)))   maxScore = Math.max(maxScore, 4);
    if (MEDIUM_SEVERITY.some((k) => lower.includes(k))) maxScore = Math.max(maxScore, 3);
    if (LOW_SEVERITY.some((k) => lower.includes(k)))    maxScore = Math.max(maxScore, 2);
  }
  return maxScore;
}

function severityLabel(score: number): VisionDetectionResult["severityLabel"] {
  if (score >= 4) return "critical";
  if (score === 3) return "high";
  if (score === 2) return "medium";
  return "low";
}

// --------------------------------------------------------------------------
// Service
// --------------------------------------------------------------------------

export const visionService = {
  /**
   * Performs client-side image preprocessing (EXIF stripping, scaling to 1024px, auto-rotate, brightness normalization)
   */
  async preprocessImage(file: File): Promise<{ base64: string; mimeType: string }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(img.src);
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Failed to get canvas context"));
          return;
        }

        // Limit dimensions to max 1024px (Phase 2)
        const MAX_DIM = 1024;
        let width = img.width;
        let height = img.height;
        if (width > MAX_DIM || height > MAX_DIM) {
          if (width > height) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          } else {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }

        canvas.width = width;
        canvas.height = height;

        // Auto-rotation and EXIF stripping happens automatically via drawImage
        ctx.drawImage(img, 0, 0, width, height);

        // Normalize brightness and contrast (Phase 2)
        try {
          const imgData = ctx.getImageData(0, 0, width, height);
          let sum = 0;
          for (let i = 0; i < imgData.data.length; i += 4) {
            sum += 0.299 * imgData.data[i] + 0.587 * imgData.data[i+1] + 0.114 * imgData.data[i+2];
          }
          const avgBrightness = sum / (imgData.data.length / 4);

          if (avgBrightness < 80) {
            ctx.clearRect(0, 0, width, height);
            ctx.filter = "brightness(1.2) contrast(1.15) saturate(1.1)";
            ctx.drawImage(img, 0, 0, width, height);
            ctx.filter = "none";
          } else if (avgBrightness > 220) {
            ctx.clearRect(0, 0, width, height);
            ctx.filter = "brightness(0.9) contrast(1.2) saturate(1.0)";
            ctx.drawImage(img, 0, 0, width, height);
            ctx.filter = "none";
          }
        } catch (brightnessErr) {
          console.warn("Luminosity scaling skipped:", brightnessErr);
        }

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Canvas conversion to Blob failed"));
              return;
            }
            const reader = new FileReader();
            reader.onloadend = () => {
              const dataUrl = reader.result as string;
              const base64 = dataUrl.split(",")[1];
              resolve({ base64, mimeType: "image/jpeg" });
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          },
          "image/jpeg",
          0.80 // 80% compression (Phase 2)
        );
      };
      img.onerror = (err) => {
        URL.revokeObjectURL(img.src);
        reject(err);
      };
    });
  },

  /**
   * Analyses a civic-issue image via the AI vision endpoint.
   *
   * Tries primary local endpoint first, and automatically falls back to
   * the remote Supabase Edge Function on failure or timeout.
   */
  async analyseImage(options: VisionAnalysisOptions): Promise<VisionDetectionResult> {
    const emptyResult: VisionDetectionResult = {
      top: "",
      classes: [],
      severity: 1,
      severityLabel: "low",
      annotatedImage: null,
      confidences: {},
    };

    const localEndpoint = (import.meta as any).env?.VITE_VISION_API_URL;
    const fallbackEndpoint = `${(import.meta as any).env?.VITE_SUPABASE_URL}/functions/v1/detect-issue`;

    let response: Response | null = null;
    let lastError: any = null;

    // Try primary local endpoint if configured
    if (localEndpoint) {
      try {
        console.log("[visionService] Attempting primary vision endpoint:", localEndpoint);
        response = await fetch(localEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image: options.base64Image,
            imageBase64: options.base64Image,
            mime_type: options.mimeType ?? "image/jpeg",
          }),
          signal: AbortSignal.timeout(3000), // Fast 3s timeout for local endpoint
        });
      } catch (err) {
        lastError = err;
        console.warn("[visionService] Primary endpoint failed, falling back to edge function:", err);
      }
    }

    // Try fallback Supabase Edge Function if primary failed or was not configured
    if (!response || !response.ok) {
      try {
        console.log("[visionService] Attempting fallback edge function:", fallbackEndpoint);
        
        // Grab local auth headers if available
        const sessionStr = localStorage.getItem("sb-vttrmmrirdnijhklgllx-auth-token");
        let token = "";
        if (sessionStr) {
          try {
            const parsed = JSON.parse(sessionStr);
            token = parsed?.access_token || "";
          } catch (_) {
            // ignore
          }
        }

        response = await fetch(fallbackEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { "Authorization": `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            image: options.base64Image,
            imageBase64: options.base64Image,
            mime_type: options.mimeType ?? "image/jpeg",
          }),
          signal: AbortSignal.timeout(15_000), // 15s timeout to allow fallback success
        });
      } catch (err) {
        lastError = err;
        console.error("[visionService] Fallback edge function failed:", err);
      }
    }

    if (!response || !response.ok) {
      console.error("[visionService] All vision detection endpoints failed.");
      throw lastError || new Error("Vision detection service is currently unavailable.");
    }

    // ── Parse and normalise response ─────────────────────────────────────
    let raw: any;
    try {
      raw = await response.json();
    } catch {
      console.warn("[visionService] Failed to parse vision response JSON");
      return emptyResult;
    }

    const rawClasses: string[] = Array.isArray(raw?.classes) ? raw.classes : [];
    const confidences: Record<string, number> = raw?.confidences ?? {};
    const annotatedImage: string | null = raw?.annotatedImage ?? raw?.annotated_image ?? null;

    // Normalise class names using the civic map
    const normalisedClasses = rawClasses.map(
      (cls) => CIVIC_CLASS_MAP[cls.toLowerCase()] ?? cls
    );

    const top = normalisedClasses[0] ?? "";
    const severity = estimateSeverity(rawClasses);

    return {
      top: raw?.top || top,
      classes: normalisedClasses.length ? normalisedClasses : (raw?.top ? [raw.top] : []),
      severity,
      severityLabel: severityLabel(severity),
      annotatedImage,
      confidences,
      confidence: raw?.confidence,
      reason: raw?.reason,
      potentialRisk: raw?.potentialRisk || raw?.potential_risk,
      recommendedPriority: raw?.recommendedPriority || raw?.recommended_priority,
      provider: raw?.provider,
      issueTitle: raw?.issueTitle || raw?.issue_title,
      category: raw?.category,
      department: raw?.department,
      supportingDepartments: raw?.supportingDepartments || raw?.supporting_departments || [],
      requiresMultipleDepartments: raw?.requiresMultipleDepartments ?? false,
      estimatedResponseTime: raw?.estimatedResponseTime || raw?.estimated_response_time,
      latencyMs: raw?.latencyMs ?? raw?.latency_ms,
    };
  },

  /**
   * Converts a File object to a base64 string suitable for the vision API.
   */
  fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        resolve(dataUrl.split(",")[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },
};
