import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const NVIDIA_BASE = "https://integrate.api.nvidia.com/v1";
const VISION_MODEL = "meta/llama-3.2-11b-vision-instruct";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Rate limiter helper based on client IP
const requestLog = new Map<string, number[]>();
function isRateLimited(ip: string, limit = 20, windowMs = 60_000): boolean {
  const now = Date.now();
  const timestamps = (requestLog.get(ip) ?? []).filter((t) => now - t < windowMs);
  timestamps.push(now);
  requestLog.set(ip, timestamps);
  return timestamps.length > limit;
}

const SYSTEM_PROMPT = `You are a strict Indian civic document verification officer.
Analyze the provided document scan/photo and determine if it is a valid government document (e.g. Aadhaar Card, PAN Card, Driving License, Income Certificate, Property Tax Receipt, Passport, or other official government certificate/card).

If it is NOT a valid government document (for example, it is a selfie, meme, landscape, street photo, pothole image, garbage heap, private letter, food bill, or blank page), you MUST set "supported" to false and provide a clear, helpful "rejection_reason" explaining what was detected and why it is not accepted.

If it is a supported government document, set "supported" to true and extract structured details:
- Identify the document_type as one of: "aadhaar", "pan", "license", "income", "property", "other".
- Determine status: "expires_soon" (if it has an expiry date within the next 30 days), "verified" (if it is a recognized authentic card/certificate not expiring soon), or "uploaded" (general default).
- Extract holder_name (Full name of the document holder, exactly as written).
- Extract document_number (ID number/unique code, mask middle digits if sensitive).
- Extract dob_or_issuance (Date of birth or issuance date in YYYY-MM-DD format if present).
- Extract expiry_date (Expiry date in YYYY-MM-DD format if present, else null).
- Extract address (Full address if present, else null).
- Extract issuing_authority (e.g., UIDAI, Income Tax Department, Transport Department).
- Provide a complete transcription in "ocr_text".
- Provide a 2-sentence user-friendly plain-text summary in "ai_summary" explaining what the document is and its validity.

Respond ONLY with a valid JSON object matching this schema:
{
  "supported": boolean,
  "rejection_reason": string | null,
  "document_type": "aadhaar" | "pan" | "license" | "income" | "property" | "other" | null,
  "status": "verified" | "expires_soon" | "uploaded" | null,
  "ocr_text": string | null,
  "ai_summary": string | null,
  "metadata": {
    "holder_name": string | null,
    "document_number": string | null,
    "dob_or_issuance": string | null,
    "expiry_date": string | null,
    "address": string | null,
    "issuing_authority": string | null
  }
}
`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const ip = req.headers.get("x-forwarded-for") ?? "unknown";
    if (isRateLimited(ip)) {
      return errorResponse("Too many requests. Please wait a moment and try again.", 429);
    }

    // 1. Parse request body
    const body = await req.json();
    const { fileBase64, mimeType } = body;

    if (!fileBase64 || !mimeType) {
      return errorResponse("fileBase64 and mimeType are required", 400);
    }

    const allowedMimes = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    if (!allowedMimes.includes(mimeType)) {
      return errorResponse("Only PDF, JPEG, PNG, or WebP files are accepted", 400);
    }

    // 2. Invoke NVIDIA NIM Llama 3.2 Vision Model with separated roles
    const visionResponse = await callNvidiaNIM(VISION_MODEL, [
      {
        role: "system",
        content: SYSTEM_PROMPT
      },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: `data:${mimeType};base64,${fileBase64}` }
          }
        ]
      }
    ]);

    // 3. Parse JSON output
    let result;
    const rawText = visionResponse.choices[0]?.message?.content || "";
    console.log("VLM Output Raw Content:", rawText);

    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON structure block detected in vision model output.");
      }
      result = JSON.parse(jsonMatch[0]);

      // Normalize internal keys if present but blank
      if (result.supported === undefined) result.supported = true;
      if (!result.document_type) result.document_type = "other";
      if (!result.metadata) result.metadata = {};
    } catch (parseError) {
      console.warn("Structured JSON parsing failed. Executing heuristic fallback parser. Error:", parseError);
      try {
        result = parseFallbackText(rawText);
        console.log("Successfully constructed JSON from plain text/markdown:", result);
      } catch (fallbackError) {
        console.error("Heuristic parser failed to recover output:", fallbackError);
        return errorResponse(`Failed to parse document analysis from the vision model. Raw VLM text: "${rawText}"`, 500);
      }
    }

    // 4. Return structured VLM result
    return jsonResponse({
      success: true,
      data: result
    });

  } catch (err: any) {
    console.error("analyze-document error:", err);
    return errorResponse(`Internal server error: ${err.message || err}`, 500);
  }
});

// Heuristic Fallback Parser for Plain Text/Markdown VLM Outputs

function parseFallbackText(rawText: string): any {
  const result = {
    supported: true,
    rejection_reason: null,
    document_type: "other",
    status: "uploaded",
    ocr_text: rawText,
    ai_summary: null,
    metadata: {
      holder_name: null,
      document_number: null,
      dob_or_issuance: null,
      expiry_date: null,
      address: null,
      issuing_authority: null
    }
  };

  const lower = rawText.toLowerCase();

  // 1. Classify type tag
  if (lower.includes("aadhaar") || lower.includes("uidai") || lower.includes("unique identification")) {
    result.document_type = "aadhaar";
    result.metadata.issuing_authority = "UIDAI";
  } else if (lower.includes("pan card") || lower.includes("permanent account") || lower.includes("income tax")) {
    result.document_type = "pan";
    result.metadata.issuing_authority = "Income Tax Department";
  } else if (lower.includes("driving") || lower.includes("licence") || lower.includes("license") || lower.includes("transport department")) {
    result.document_type = "license";
    result.metadata.issuing_authority = "Transport Department";
  } else if (lower.includes("income") || lower.includes("salary") || lower.includes("revenue officer")) {
    result.document_type = "income";
  } else if (lower.includes("property") || lower.includes("tax receipt") || lower.includes("holding") || lower.includes("municipality")) {
    result.document_type = "property";
  }

  // 2. Detect Rejections heuristically from text keywords
  const rejectionKeywords = [
    "not a valid",
    "not valid",
    "not a government",
    "not government",
    "invalid",
    "reject",
    "rejection",
    "unsupported",
    "cannot verify",
    "selfie",
    "screenshot",
    "meme",
    "landscape",
    "pothole",
    "garbage",
    "private letter",
    "food bill",
    "blank page",
    "not accepted",
    "preferences",
    "settings page"
  ];
  
  let isRejected = false;
  for (const keyword of rejectionKeywords) {
    if (lower.includes(keyword)) {
      isRejected = true;
      break;
    }
  }

  // If no type tag matched and it doesn't mention typical official keywords
  if (result.document_type === "other" && !lower.includes("government") && !lower.includes("certificate") && !lower.includes("identity")) {
    isRejected = true;
  }

  if (isRejected) {
    result.supported = false;
    result.rejection_reason = rawText.length > 200 ? rawText.substring(0, 200) + "..." : rawText;
    result.status = null;
    return result;
  }

  // 3. Scan lines for structured prefix patterns
  const lines = rawText.split("\n");
  for (const line of lines) {
    const cleaned = line.replace(/^\s*[-*#+]\s*/, "").trim();

    // Name
    const nameMatch = cleaned.match(/(?:holder\s+)?name\s*:\s*(.*)/i) || 
                      cleaned.match(/(?:full\s+)?name\s*:\s*(.*)/i);
    if (nameMatch && !result.metadata.holder_name) {
      result.metadata.holder_name = cleanValue(nameMatch[1]);
    }

    // Number
    const numMatch = cleaned.match(/(?:document|card|id|aadhaar|pan|dl)\s+(?:number|no\.?)\s*:\s*(.*)/i) ||
                     cleaned.match(/(?:unique\s+id|permanent\s+account)\s*:\s*(.*)/i);
    if (numMatch && !result.metadata.document_number) {
      result.metadata.document_number = cleanValue(numMatch[1]);
    }

    // DOB / Issue Date
    const dobMatch = cleaned.match(/(?:dob|date\s+of\s+birth|issue|issuance|date\s+of\s+issue)\s*:\s*(.*)/i);
    if (dobMatch && !result.metadata.dob_or_issuance) {
      result.metadata.dob_or_issuance = cleanDate(dobMatch[1]);
    }

    // Expiry Date
    const expMatch = cleaned.match(/(?:expiry|valid\s+upto|valid\s+until|expire)\s*:\s*(.*)/i);
    if (expMatch && !result.metadata.expiry_date) {
      result.metadata.expiry_date = cleanDate(expMatch[1]);
    }

    // Address
    const addrMatch = cleaned.match(/address\s*:\s*(.*)/i);
    if (addrMatch && !result.metadata.address) {
      result.metadata.address = cleanValue(addrMatch[1]);
    }

    // Issuing Authority
    const authMatch = cleaned.match(/(?:issuing\s+)?authority\s*:\s*(.*)/i) ||
                      cleaned.match(/(?:issued\s+)?by\s*:\s*(.*)/i);
    if (authMatch && !result.metadata.issuing_authority) {
      result.metadata.issuing_authority = cleanValue(authMatch[1]);
    }

    // AI Summary
    const sumMatch = cleaned.match(/(?:ai\s+)?summary\s*:\s*(.*)/i);
    if (sumMatch && !result.ai_summary) {
      result.ai_summary = cleanValue(sumMatch[1]);
    }
  }

  // 4. Fallback Regex matches for numbers if prefixes missed
  if (!result.metadata.document_number) {
    const aadhaarRegex = /\b\d{4}\s\d{4}\s\d{4}\b|\b\d{12}\b/;
    const matchesAadhaar = rawText.match(aadhaarRegex);
    if (matchesAadhaar) {
      result.metadata.document_number = matchesAadhaar[0];
    } else {
      const panRegex = /\b[A-Z]{5}[0-9]{4}[A-Z]\b/;
      const matchesPan = rawText.match(panRegex);
      if (matchesPan) {
        result.metadata.document_number = matchesPan[0];
      }
    }
  }

  // Auto-generate AI Summary if not extracted
  if (!result.ai_summary) {
    const docName = result.document_type.toUpperCase();
    const holder = result.metadata.holder_name ? ` belonging to ${result.metadata.holder_name}` : "";
    result.ai_summary = `Parsed ${docName} document${holder}. Verified and extracted successfully.`;
  }

  return result;
}

function cleanValue(val: string): string {
  return val.replace(/[*_`"']/g, "").trim();
}

function cleanDate(val: string): string | null {
  const cleaned = cleanValue(val);
  const dateMatch = cleaned.match(/\b\d{4}[-/]\d{2}[-/]\d{2}\b/) || 
                    cleaned.match(/\b\d{2}[-/]\d{2}[-/]\d{4}\b/);
  if (dateMatch) {
    const matched = dateMatch[0].replace(/\//g, "-");
    const parts = matched.split("-");
    if (parts[0].length === 4) {
      return matched;
    } else if (parts[2].length === 4) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
  }
  return cleaned || null;
}

// Helpers

async function callNvidiaNIM(model: string, messages: any[]) {
  const nvidiaKey = Deno.env.get("NVIDIA_NIM_API_KEY");
  if (!nvidiaKey) {
    throw new Error("NVIDIA_NIM_API_KEY environment variable is missing on this Supabase project.");
  }

  const res = await fetch(`${NVIDIA_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${nvidiaKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ model, messages, max_tokens: 2048, temperature: 0.1 })
  });

  if (!res.ok) {
    throw new Error(`NVIDIA NIM error: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" }
  });
}

function errorResponse(message: string, status = 400) {
  return jsonResponse({ status: "error", message }, status);
}
