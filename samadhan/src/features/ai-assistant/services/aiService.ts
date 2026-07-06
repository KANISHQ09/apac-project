import { supabase } from "@/integrations/supabase/client";
import { APIError } from "@/shared/errors/errors";
import { logger } from "@/shared/services/logger";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/samadhan-chat`;

export const aiService = {
  /**
   * Streams a conversation with Samadhan AI civic assistant.
   */
  async streamChat({
    messages,
    onDelta,
    onDone,
    onError,
  }: {
    messages: ChatMessage[];
    onDelta: (deltaText: string) => void;
    onDone: () => void;
    onError: (error: string) => void;
  }): Promise<void> {
    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages }),
      });

      if (!resp.ok) {
        const errorData = await resp.json().catch(() => ({}));
        const errorMessage = errorData.error || "Failed to get response. Please try again.";
        onError(errorMessage);
        return;
      }

      if (!resp.body) {
        onError("No response received. Please try again.");
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let streamDone = false;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") {
            streamDone = true;
            break;
          }

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) onDelta(content);
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      // Final stream flush
      if (textBuffer.trim()) {
        for (let raw of textBuffer.split("\n")) {
          if (!raw) continue;
          if (raw.endsWith("\r")) raw = raw.slice(0, -1);
          if (raw.startsWith(":") || raw.trim() === "") continue;
          if (!raw.startsWith("data: ")) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) onDelta(content);
          } catch {
            // Ignore incomplete chunks in final flush
          }
        }
      }

      onDone();
    } catch (error: any) {
      logger.error("Chat stream error:", error);
      onError("Connection error. Please check your internet and try again.");
    }
  },

  /**
   * Invokes the detect-issue Edge Function to execute Roboflow analysis.
   */
  async detectIssue(base64Image: string): Promise<{
    classes: string[];
    top: string;
    annotatedImage: string | null;
  }> {
    const { data, error } = await supabase.functions.invoke("detect-issue", {
      body: { imageBase64: base64Image },
    });

    if (error) {
      throw new APIError(error.message, undefined, error);
    }

    return {
      classes: data?.classes || [],
      top: data?.top || "",
      annotatedImage: data?.annotatedImage || null,
    };
  },

  /**
   * Invokes the analyze-form Edge Function directly on the new project
   */
  async analyzeFormDirect(
    file: File,
    userQuery?: string
  ): Promise<FormAnalysisResult> {
    return analyzeFormDirect(file, userQuery);
  }
};

export interface FormAnalysisResult {
  status: "success" | "rejected" | "low_confidence" | "unsupported_form" | "error";
  form_code?: string;
  form_name?: string;
  confidence?: number;
  chunks_used?: number;
  reason?: string;
  guidance?: {
    summary: string;
    scheme_benefit: string;
    eligibility: string[];
    required_documents: Array<{ name: string; details: string }>;
    filling_steps: Array<{ step: number; field: string; instruction: string; example: string | null }>;
    submission: {
      where: string;
      online_portal: string | null;
      deadline: string | null;
      fee: string;
    };
    important_notes: string[];
    custom_query_answer?: string | null;
    sources: Array<{
      chunk_title: string;
      chunk_type: string;
      similarity: number;
      form_name: string;
      version: string;
      source_url: string;
      last_verified: string;
    }>;
  };
}

export async function analyzeFormDirect(
  file: File,
  userQuery?: string
): Promise<FormAnalysisResult> {
  // Validate file size (max 10MB)
  if (file.size > 10 * 1024 * 1024) {
    throw new Error("File size must be under 10MB");
  }

  const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    throw new Error("Only PDF, JPEG, PNG, or WebP files are accepted");
  }

  // NVIDIA vision model cannot process raw PDFs — rasterize first page to JPEG.
  let fileBase64: string;
  let effectiveMimeType: string;

  if (file.type === "application/pdf") {
    const { base64, mimeType } = await pdfFirstPageToJpeg(file);
    fileBase64 = base64;
    effectiveMimeType = mimeType;
  } else {
    fileBase64 = await fileToBase64(file);
    effectiveMimeType = file.type;
  }

  const formKbUrl = import.meta.env.VITE_FORM_KB_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;
  const formKbAnonKey = import.meta.env.VITE_FORM_KB_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

  const response = await fetch(`${formKbUrl}/functions/v1/analyze-form`, {
    method: "POST",
    headers: {
      "apikey": formKbAnonKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      fileBase64,
      mimeType: effectiveMimeType,
      userQuery: userQuery || null
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: "Unknown error" }));
    throw new Error(err.message || "Form analysis failed");
  }

  return response.json();
}

/**
 * Renders the first page of a PDF file to a JPEG image using PDF.js.
 * NVIDIA NIM vision models accept images (JPEG/PNG/WebP) but NOT raw PDFs.
 * We rasterise at 2x scale (144 DPI) for sharp, readable form text.
 */
export async function pdfFirstPageToJpeg(
  file: File
): Promise<{ base64: string; mimeType: string }> {
  // Dynamic import keeps pdfjs out of the initial bundle
  const pdfjsLib = await import("pdfjs-dist");

  // Point the worker at the bundled worker script
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(1);

  // Scale 2x so form text stays legible for the VLM
  const viewport = page.getViewport({ scale: 2.0 });

  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d")!;

  await page.render({ canvasContext: ctx, viewport }).promise;

  // Export as JPEG (quality 0.92) — strips alpha, smaller payload
  const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
  const base64 = dataUrl.split(",")[1];
  return { base64, mimeType: "image/jpeg" };
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the data URL prefix (e.g. "data:image/jpeg;base64,")
      resolve(result.split(",")[1]);
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

