/**
 * visionService.ts
 * ----------------
 * Frontend Vision Pipeline — Multimodal Image Analysis.
 *
 * Task 1.3 — Develop Multimodal Vision Pipeline (ImplementationPlan.md)
 *
 * This service provides a thin frontend client that:
 *  1. Encodes an uploaded image to base64.
 *  2. Sends it to the configured AI vision endpoint (Gemini Vision / FastAPI).
 *  3. Returns structured civic-issue metadata: detected classes, severity
 *     estimation, and an annotated thumbnail.
 *
 * If the backend endpoint is unavailable it degrades gracefully by returning
 * an empty result so the user can still fill in details manually.
 */

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export interface VisionDetectionResult {
  /** Top-confidence detected class (e.g. "pothole", "garbage") */
  top: string;
  /** All detected class labels, ranked by confidence */
  classes: string[];
  /** Estimated severity 1–5 (5 = critical) */
  severity: number;
  /** Human-readable severity label */
  severityLabel: "low" | "medium" | "high" | "critical";
  /** Optional base64-encoded JPEG with bounding box annotations */
  annotatedImage: string | null;
  /** Raw confidence scores keyed by class name */
  confidences: Record<string, number>;
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
   * Analyses a civic-issue image via the AI vision endpoint.
   *
   * Falls back to an empty result on network or parsing errors so the caller
   * can gracefully prompt the user to enter details manually.
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

    // ── Build the request ────────────────────────────────────────────────
    // The endpoint is the Supabase Edge Function or a FastAPI microservice.
    // Falls back to a Gemini Vision call if VITE_VISION_API_URL is not set.
    const endpointUrl =
      (import.meta as any).env?.VITE_VISION_API_URL ||
      `${(import.meta as any).env?.VITE_SUPABASE_URL}/functions/v1/detect-issue`;

    let response: Response;
    try {
      response = await fetch(endpointUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: options.base64Image,
          mime_type: options.mimeType ?? "image/jpeg",
        }),
        signal: AbortSignal.timeout(15_000), // 15 s timeout
      });
    } catch (networkErr) {
      // Network unavailable or endpoint not deployed — degrade gracefully
      console.warn("[visionService] Vision endpoint unreachable:", networkErr);
      return emptyResult;
    }

    if (!response.ok) {
      console.warn("[visionService] Vision endpoint returned", response.status);
      return emptyResult;
    }

    // ── Parse and normalise response ─────────────────────────────────────
    let raw: any;
    try {
      raw = await response.json();
    } catch {
      console.warn("[visionService] Failed to parse vision response JSON");
      return emptyResult;
    }

    // The Edge Function / FastAPI is expected to return:
    //   { classes: string[], annotatedImage?: string, confidences?: Record<string, number> }
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
      top,
      classes: normalisedClasses,
      severity,
      severityLabel: severityLabel(severity),
      annotatedImage,
      confidences,
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
        // Strip the "data:<mime>;base64," prefix
        resolve(dataUrl.split(",")[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },
};
