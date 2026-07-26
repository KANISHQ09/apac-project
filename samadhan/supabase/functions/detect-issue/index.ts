import { verifyUser } from "../shared/edge/auth/jwt.ts";
import { getCorsAndSecurityHeaders } from "../shared/edge/middleware/cors.ts";
import { checkRateLimit } from "../shared/edge/middleware/rateLimit.ts";
import { logSecurityEvent } from "../shared/edge/services/securityLogger.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const WORKSPACE = "kanishqs-workspace-sqcbc";
const WORKFLOW_ID = "general-segmentation-api-2";

// Zod validation schema for request payload supporting multiple parameter namings for backwards compatibility
const detectPayloadSchema = z
  .object({
    imageBase64: z.string().trim().optional(),
    image: z.string().trim().optional(),
    imageUrl: z.string().trim().optional(),
    image_url: z.string().trim().optional(),
    mime_type: z.string().trim().optional(),
    mimeType: z.string().trim().optional(),
  })
  .refine((data) => data.imageBase64 || data.image || data.imageUrl || data.image_url, {
    message: "Either imageBase64, image, imageUrl, or image_url must be provided",
  });

// Expanded Semantic Normalization Logic (Phase 9 & 6)
function normalizeCategoryAndDepartment(rawCategory: string, rawDept: string, issueType: string): {
  category: string;
  department: string;
  supportingDepartments: string[];
  requiresMultipleDepartments: boolean;
} {
  const cat = (rawCategory || "").toLowerCase();
  const dept = (rawDept || "").toLowerCase();
  const type = (issueType || "").toLowerCase();

  // 1. Fallen tree / Tree blocking road (Phase 9)
  if (type.includes("tree") || cat.includes("tree") || type.includes("vegetation")) {
    return {
      category: "Parks & Gardens",
      department: "Parks & Gardens Department",
      supportingDepartments: ["Road Department"],
      requiresMultipleDepartments: true,
    };
  }

  // 2. Broken streetlight (Phase 9)
  if (type.includes("streetlight") || type.includes("street light") || type.includes("lamp post") || type.includes("lamp")) {
    return {
      category: "Electricity",
      department: "Electricity Department",
      supportingDepartments: [],
      requiresMultipleDepartments: false,
    };
  }

  // 3. Divider/median damage (Phase 9)
  if (type.includes("divider") || type.includes("median") || type.includes("barrier")) {
    return {
      category: "Roads",
      department: "Road Department",
      supportingDepartments: [],
      requiresMultipleDepartments: false,
    };
  }

  // 4. Drain blockage / Sewage overflow / Waterlogging (Phase 9)
  if (type.includes("drain") || type.includes("sewage") || type.includes("sewer") || type.includes("waterlogging") || type.includes("water-logging")) {
    return {
      category: "Sanitation",
      department: "Sanitation Department",
      supportingDepartments: ["Water Department"],
      requiresMultipleDepartments: true,
    };
  }

  // 5. Electric pole / wire down (Phase 9)
  if (type.includes("electric pole") || type.includes("wire down") || type.includes("cable") || type.includes("transformer") || type.includes("pole")) {
    return {
      category: "Electricity",
      department: "Electricity Department",
      supportingDepartments: [],
      requiresMultipleDepartments: false,
    };
  }

  // 6. Wall collapse / Building collapse (Phase 9)
  if (type.includes("wall collapse") || type.includes("building collapse") || type.includes("collapse")) {
    return {
      category: "Buildings",
      department: "Buildings Department",
      supportingDepartments: ["Road Department"],
      requiresMultipleDepartments: true,
    };
  }

  // Water Supply generic
  if (
    cat.includes("water") || cat.includes("leak") || cat.includes("flood") ||
    dept.includes("water") ||
    type.includes("water") || type.includes("leak") || type.includes("flood")
  ) {
    return {
      category: "Water Supply",
      department: "Water Department",
      supportingDepartments: [],
      requiresMultipleDepartments: false,
    };
  }

  // Sanitation generic
  if (
    cat.includes("garbage") || cat.includes("trash") || cat.includes("waste") || cat.includes("litter") || cat.includes("sanit") || cat.includes("dump") || cat.includes("animal") ||
    dept.includes("sanitation") || dept.includes("garbage") || dept.includes("dump") ||
    type.includes("garbage") || type.includes("trash") || type.includes("waste") || type.includes("litter") || type.includes("dump") || type.includes("animal")
  ) {
    return {
      category: "Sanitation",
      department: "Sanitation Department",
      supportingDepartments: [],
      requiresMultipleDepartments: false,
    };
  }

  // Electricity generic
  if (
    cat.includes("electric") || cat.includes("light") || cat.includes("power") ||
    dept.includes("electric") || dept.includes("light") || dept.includes("power") ||
    type.includes("electric") || type.includes("light") || type.includes("power")
  ) {
    return {
      category: "Electricity",
      department: "Electricity Department",
      supportingDepartments: [],
      requiresMultipleDepartments: false,
    };
  }

  // Roads generic
  if (
    cat.includes("road") || cat.includes("pothole") || cat.includes("pavement") || cat.includes("crack") || cat.includes("footpath") || cat.includes("signal") || cat.includes("traffic") || cat.includes("parking") || cat.includes("barricade") || cat.includes("obstruction") ||
    dept.includes("road") || dept.includes("street") || dept.includes("traffic") ||
    type.includes("road") || type.includes("pothole") || type.includes("pavement") || type.includes("crack") || type.includes("footpath") || type.includes("signal") || type.includes("traffic") || type.includes("parking") || type.includes("barricade") || type.includes("obstruction")
  ) {
    return {
      category: "Roads",
      department: "Road Department",
      supportingDepartments: [],
      requiresMultipleDepartments: false,
    };
  }

  // Parks generic
  if (
    cat.includes("park") || cat.includes("garden") || cat.includes("bench") || cat.includes("playground") || cat.includes("fenc") ||
    dept.includes("park") || dept.includes("garden") ||
    type.includes("park") || type.includes("garden") || type.includes("bench") || type.includes("playground") || type.includes("fenc")
  ) {
    return {
      category: "Parks & Gardens",
      department: "Parks & Gardens Department",
      supportingDepartments: [],
      requiresMultipleDepartments: false,
    };
  }

  // Buildings generic
  if (
    cat.includes("building") || cat.includes("wall") || cat.includes("construction") || cat.includes("fire") || cat.includes("landslide") || cat.includes("manhole") || cat.includes("debris") || cat.includes("pit") ||
    dept.includes("building") || dept.includes("construction") || dept.includes("safety") || dept.includes("emergency") ||
    type.includes("building") || type.includes("wall") || type.includes("construction") || type.includes("fire") || type.includes("landslide") || type.includes("manhole") || type.includes("debris") || type.includes("pit")
  ) {
    return {
      category: "Buildings",
      department: "Buildings Department",
      supportingDepartments: [],
      requiresMultipleDepartments: false,
    };
  }

  // Fallback default to Roads
  return {
    category: "Roads",
    department: "Road Department",
    supportingDepartments: [],
    requiresMultipleDepartments: false,
  };
}

function getEstimatedResponseTime(priority: string): string {
  const p = (priority || "").toUpperCase();
  if (p === "CRITICAL") return "2-4 hours";
  if (p === "HIGH") return "12-24 hours";
  if (p === "MEDIUM") return "2-3 days";
  return "5-7 days";
}

// Roboflow prediction mapper (Phase 5)
function getRoboflowDetections(topClass: string): {
  issueTitle: string;
  issueType: string;
  category: string;
  department: string;
  severity: string;
  priority: string;
  citizenRisk: string;
  recommendedAction: string;
  estimatedResponseTime: string;
} {
  const norm = normalizeCategoryAndDepartment(topClass, "", topClass);
  let issueTitle = `Civic problem: ${topClass}`;
  let severity = "medium";
  let priority = "MEDIUM";
  let citizenRisk = "General public safety hazard.";
  let recommendedAction = "Inspect and deploy repair crew.";

  const c = topClass.toLowerCase();
  if (c.includes("pothole")) {
    issueTitle = "Road Pothole Detected";
    severity = "high";
    priority = "HIGH";
    citizenRisk = "Risk of structural damage to vehicles, pedestrian trip hazards, or loss of steering control.";
    recommendedAction = "Verify road surface integrity and dispatch asphalt repair team.";
  } else if (c.includes("garbage") || c.includes("trash") || c.includes("waste")) {
    issueTitle = "Accumulated Garbage Pile";
    severity = "medium";
    priority = "MEDIUM";
    citizenRisk = "Biohazard and odor issues; potential disease vector breeding ground if left uncollected.";
    recommendedAction = "Dispatch collection truck and sanitize bin area.";
  }

  return {
    issueTitle,
    issueType: topClass,
    category: norm.category,
    department: norm.department,
    severity,
    priority,
    citizenRisk,
    recommendedAction,
    estimatedResponseTime: getEstimatedResponseTime(priority)
  };
}

async function callGeminiVision(base64Image: string, mimeType: string, signal?: AbortSignal): Promise<any> {
  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  if (!geminiKey) {
    console.log("✗ Failure Reason (Gemini): GEMINI_API_KEY not configured");
    throw new Error("GEMINI_API_KEY not configured");
  }

  // Model as Civic Inspector prompt design (Phase 10)
  const systemInstruction = `You are a municipal civic-issue inspector for the Samadhan application. Your job is to analyze the uploaded image and output a structured JSON response identifying the civic issue and mapping it to the responsible municipal departments.

Allowed Categories: Water Supply, Sanitation, Electricity, Roads, Parks & Gardens, Buildings.
Allowed Departments: Road Department, Water Department, Sanitation Department, Electricity Department, Parks & Gardens Department, Buildings Department.
Allowed Supporting Departments: Road Department, Water Department, Sanitation Department, Electricity Department, Parks & Gardens Department, Buildings Department.
Allowed Severities: low, medium, high, critical.
Allowed Priorities: LOW, MEDIUM, HIGH, CRITICAL.

You must follow these rules:
1. Identify the primary civic issue in the image (e.g. pothole, garbage dump, fallen tree, broken streetlight, sewage overflow, wall collapse).
2. Assign the primary responsible municipal department (Lead Department).
3. Assign any supporting departments if the issue requires coordination (e.g., a fallen tree blocking a road requires Parks & Gardens Department as Lead, and Road Department as Support; a building wall collapse blocking a drain requires Buildings Department as Lead, and Water Department as Support).
4. Assign estimated response time based on priority: CRITICAL = "2-4 hours", HIGH = "12-24 hours", MEDIUM = "2-3 days", LOW = "5-7 days".
5. Return STRICT JSON ONLY. Do not wrap in markdown or blockquotes.`;

  const prompt = `Inspect this image and identify the civic issue. Map it to the allowed category, department, and supporting departments. Output ONLY valid JSON matching the schema.`;

  // Resolved working model: gemini-2.5-flash
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;

  const response = await fetch(geminiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: mimeType || "image/jpeg",
                data: base64Image,
              }
            }
          ]
        }
      ],
      systemInstruction: { parts: [{ text: systemInstruction }] },
      generationConfig: {
        responseMimeType: "application/json",
        thinkingConfig: {
          thinkingBudget: 0
        },
        responseSchema: {
          type: "OBJECT",
          properties: {
            issueTitle: { type: "STRING" },
            issueType: { type: "STRING" },
            category: {
              type: "STRING",
              enum: ["Water Supply", "Sanitation", "Electricity", "Roads", "Parks & Gardens", "Buildings"]
            },
            department: {
              type: "STRING",
              enum: ["Road Department", "Water Department", "Sanitation Department", "Electricity Department", "Parks & Gardens Department", "Buildings Department"]
            },
            supportingDepartments: {
              type: "ARRAY",
              items: {
                type: "STRING",
                enum: ["Road Department", "Water Department", "Sanitation Department", "Electricity Department", "Parks & Gardens Department", "Buildings Department"]
              }
            },
            severity: {
              type: "STRING",
              enum: ["low", "medium", "high", "critical"]
            },
            priority: {
              type: "STRING",
              enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"]
            },
            confidence: { type: "NUMBER" },
            citizenRisk: { type: "STRING" },
            recommendedAction: { type: "STRING" },
            estimatedResponseTime: { type: "STRING" },
            requiresMultipleDepartments: { type: "BOOLEAN" },
            summary: { type: "STRING" }
          },
          required: [
            "issueTitle",
            "issueType",
            "category",
            "department",
            "supportingDepartments",
            "severity",
            "priority",
            "confidence",
            "citizenRisk",
            "recommendedAction",
            "estimatedResponseTime",
            "requiresMultipleDepartments",
            "summary"
          ]
        }
      }
    }),
    signal
  });

  if (!response.ok) {
    const text = await response.text();
    console.log(`✗ HTTP error from Gemini API: ${response.status} - ${text}`);
    throw new Error(`Gemini Vision API error ${response.status}: ${text}`);
  }

  // Parse JSON response (Phase 5)
  let rawText = "";
  try {
    const resData = await response.json();
    rawText = resData.candidates?.[0]?.content?.parts?.[0]?.text || "";
    console.log("Raw Gemini JSON response:\n", rawText);
  } catch (err: any) {
    console.log("✗ Failure Reason (Gemini JSON Extract): Failed to parse candidate JSON");
    throw err;
  }

  try {
    const parsed = JSON.parse(rawText);
    return parsed;
  } catch (parseErr: any) {
    console.log("Parser error:\n", parseErr);
    console.log("Raw response:\n", rawText);
    console.log("Expected schema:\n", JSON.stringify({
      issueTitle: "string",
      issueType: "string",
      category: "string",
      department: "string",
      supportingDepartments: ["string"],
      severity: "string",
      priority: "string",
      confidence: "number",
      citizenRisk: "string",
      recommendedAction: "string",
      estimatedResponseTime: "string",
      requiresMultipleDepartments: "boolean",
      summary: "string"
    }, null, 2));
    throw parseErr;
  }
}

Deno.serve(async (req) => {
  const headers = getCorsAndSecurityHeaders(req);

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "127.0.0.1";
  let userId: string | null = null;

  try {
    // 1. JWT Authentication Verification
    const authResult = await verifyUser(req);
    if (authResult.error) {
      await logSecurityEvent("auth_failure", { error: authResult.error }, null, clientIp);
      return new Response(JSON.stringify({ error: authResult.error }), {
        status: authResult.status,
        headers: { ...Object.fromEntries(headers.entries()), "Content-Type": "application/json" },
      });
    }
    userId = authResult.user.id;

    // 2. Rate Limiting Check
    const rateCheck = await checkRateLimit({
      userId,
      clientIp,
      endpoint: "detect",
      maxRequests: 15,
      windowSeconds: 3600,
    });

    if (!rateCheck.allowed) {
      await logSecurityEvent("rate_limit", { endpoint: "detect", limit: 15 }, userId, clientIp);
      return new Response(JSON.stringify({ error: "Too many requests. Limit is 15 requests per hour." }), {
        status: 429,
        headers: { ...Object.fromEntries(headers.entries()), "Content-Type": "application/json" },
      });
    }

    // 3. Payload Validation
    let requestBody;
    try {
      requestBody = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...Object.fromEntries(headers.entries()), "Content-Type": "application/json" },
      });
    }

    const validated = detectPayloadSchema.safeParse(requestBody);
    if (!validated.success) {
      return new Response(
        JSON.stringify({ error: "Validation failed", details: validated.error.flatten() }),
        {
          status: 400,
          headers: { ...Object.fromEntries(headers.entries()), "Content-Type": "application/json" },
        }
      );
    }

    const base64Data = validated.data.imageBase64 || validated.data.image;
    const urlData = validated.data.imageUrl || validated.data.image_url;
    const mimeType = validated.data.mime_type || validated.data.mimeType || "image/jpeg";

    let imageBase64Resolved = base64Data;
    if (!imageBase64Resolved && urlData) {
      try {
        const imgResp = await fetch(urlData);
        if (imgResp.ok) {
          const arrayBuffer = await imgResp.arrayBuffer();
          const uint8 = new Uint8Array(arrayBuffer);
          let binary = "";
          for (let i = 0; i < uint8.byteLength; i++) {
            binary += String.fromCharCode(uint8[i]);
          }
          imageBase64Resolved = btoa(binary);
        }
      } catch (fetchErr) {
        console.warn("Failed to fetch image URL for vision conversion:", fetchErr);
      }
    }

    if (!imageBase64Resolved) {
      return new Response(JSON.stringify({ error: "No image content resolved" }), {
        status: 400,
        headers: { ...Object.fromEntries(headers.entries()), "Content-Type": "application/json" },
      });
    }

    const startTime = Date.now();
    console.log("✓ Started: AI Vision Pipeline E2E Trace");

    // Initiate Roboflow and Gemini concurrently (Phase 4 Parallel execution)
    console.log("Roboflow started");
    console.log("Gemini started");

    let geminiError: string | null = null;
    let rfError: string | null = null;

    const rfStartTime = Date.now();
    const geminiStartTime = Date.now();

    const ROBOFLOW_API_KEY = Deno.env.get("ROBOFLOW_API_KEY");

    const roboflowPromise = (async () => {
      if (!ROBOFLOW_API_KEY) {
        console.log("✗ Failure Reason (Roboflow): ROBOFLOW_API_KEY not configured");
        return null;
      }
      try {
        const body = {
          api_key: ROBOFLOW_API_KEY,
          inputs: {
            image: { type: "base64", value: imageBase64Resolved },
            classes: "Pothole, Garbage, Civic2",
          },
        };
        const resp = await fetch(
          `https://serverless.roboflow.com/infer/workflows/${WORKSPACE}/${WORKFLOW_ID}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(8000), // 8.0s timeout
          }
        );
        const elapsed = Date.now() - rfStartTime;
        if (resp.ok) {
          const res = await resp.json();
          console.log(`Roboflow finished. Duration: ${elapsed}ms`);
          return res;
        } else {
          const text = await resp.text();
          console.log(`✗ Failure Reason (Roboflow): HTTP ${resp.status} - ${text}`);
          rfError = `HTTP ${resp.status} - ${text}`;
          console.log(`✗ Failure Reason (Roboflow): ${rfError}`);
          return null;
        }
      } catch (err: any) {
        const elapsed = Date.now() - rfStartTime;
        rfError = err.message || String(err);
        console.log(`✗ Failure Reason (Roboflow): ${rfError} in ${elapsed}ms`);
        return null;
      }
    })();

    const geminiPromise = (async () => {
      try {
        const res = await callGeminiVision(imageBase64Resolved, mimeType, AbortSignal.timeout(9000));
        const elapsed = Date.now() - geminiStartTime;
        console.log(`Gemini finished. Duration: ${elapsed}ms`);
        return res;
      } catch (err: any) {
        const elapsed = Date.now() - geminiStartTime;
        geminiError = err.message || String(err);
        console.log(`✗ Failure Reason (Gemini): ${geminiError} in ${elapsed}ms`);
        return null;
      }
    })();

    // Run parallel
    const [rfResult, geminiResult] = await Promise.all([roboflowPromise, geminiPromise]);

    const totalTime = Date.now() - startTime;
    console.log(`Merged Result in ${totalTime}ms`);

    // Merge logic
    let finalClasses: string[] = [];
    let finalTop: string | null = null;
    let finalPredictions: any[] = [];
    let finalAnnotatedImage: string | null = null;
    let finalConfidence = geminiResult?.confidence || 0.50;
    let finalCategory = geminiResult?.category || "";
    let finalDepartment = geminiResult?.department || "";
    let finalPriority = geminiResult?.priority || "MEDIUM";
    let finalRisk = geminiResult?.citizenRisk || "General public hazard.";
    let finalAction = geminiResult?.recommendedAction || geminiResult?.summary || "Inspect reported area.";
    let finalTitle = geminiResult?.issueTitle || "Unidentified civic complaint";
    let finalSupportingDepts = geminiResult?.supportingDepartments || [];
    let finalRequiresMultiple = geminiResult?.requiresMultipleDepartments ?? false;

    // Parse Roboflow
    if (rfResult) {
      const outputs = Array.isArray(rfResult?.outputs) ? rfResult.outputs[0] ?? {} : rfResult?.outputs ?? {};
      for (const v of Object.values(outputs)) {
        if (v && typeof v === "object") {
          const maybe = (v as any).predictions ?? (v as any).output ?? null;
          if (Array.isArray(maybe)) finalPredictions = maybe;
          else if (maybe?.predictions) finalPredictions = maybe.predictions;
          if ((v as any).type === "base64" && (v as any).value) finalAnnotatedImage = (v as any).value;
        }
      }
      finalClasses = Array.from(new Set(finalPredictions.map((p: any) => p.class).filter(Boolean)));
      finalTop = finalClasses[0] || null;
    }

    // Merge & Decision (Phase 4)
    if (geminiResult && finalTop) {
      const matchingPred = finalPredictions.find((p: any) => p.class === finalTop);
      const rfConfidence = matchingPred?.confidence || 0.70;

      // Agreement boost
      if (geminiResult.issueType.toLowerCase().includes(finalTop.toLowerCase()) || finalTop.toLowerCase().includes(geminiResult.issueType.toLowerCase())) {
        finalConfidence = Math.min(1.0, Math.max(geminiResult.confidence, rfConfidence) + 0.10);
      } else {
        if (rfConfidence > 0.85) {
          finalConfidence = rfConfidence;
          const rfDefaults = getRoboflowDetections(finalTop);
          finalCategory = rfDefaults.category;
          finalDepartment = rfDefaults.department;
          finalPriority = rfDefaults.priority;
          finalRisk = rfDefaults.citizenRisk;
          finalAction = rfDefaults.recommendedAction;
          finalTitle = rfDefaults.issueTitle;
        }
      }
    } else if (!geminiResult && finalTop) {
      // Roboflow only
      const matchingPred = finalPredictions.find((p: any) => p.class === finalTop);
      finalConfidence = matchingPred?.confidence || 0.80;
      const rfDefaults = getRoboflowDetections(finalTop);
      finalCategory = rfDefaults.category;
      finalDepartment = rfDefaults.department;
      finalPriority = rfDefaults.priority;
      finalRisk = rfDefaults.citizenRisk;
      finalAction = rfDefaults.recommendedAction;
      finalTitle = rfDefaults.issueTitle;
    }

    // Map categories & departments semantically (Phase 6)
    const norm = normalizeCategoryAndDepartment(
      finalCategory, 
      finalDepartment, 
      finalTop || geminiResult?.issueType || ""
    );
    finalCategory = norm.category;
    finalDepartment = norm.department;
    
    // Merge supporting departments and multiple department flags
    if (norm.supportingDepartments.length > 0) {
      const mergedDepts = Array.from(new Set([...finalSupportingDepts, ...norm.supportingDepartments]));
      finalSupportingDepts = mergedDepts.filter(d => d !== finalDepartment);
      finalRequiresMultiple = true;
    }

    console.log("Final Decision: Civic hazard evaluated successfully.");

    // Print Category Mapping Trace (Phase 6)
    console.log("Detected label:", finalTop || geminiResult?.issueType || "Unknown");
    console.log("↓ Mapped category:", finalCategory || "None");
    console.log("↓ Lead Department:", finalDepartment || "None");
    console.log("↓ Supporting Departments:", JSON.stringify(finalSupportingDepts));
    console.log("↓ Priority:", finalPriority);
    console.log("↓ Estimated Response Time:", getEstimatedResponseTime(finalPriority));

    // Zero-failures guard (Phase 11): if both failed, return actual log details, never silent failures
    if (!finalCategory && !finalTop && !geminiResult) {
      console.log("✗ Failure Reason: Both Gemini and Roboflow failed to identify any hazard.");
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "No issues detected. Both Gemini and Roboflow failed to identify any hazard.",
          geminiError,
          rfError
        }),
        {
          status: 200, // Status 200 to allow client-side fallback warning render
          headers: { ...Object.fromEntries(headers.entries()), "Content-Type": "application/json" },
        }
      );
    }

    console.log("✓ Success: AI Vision Pipeline E2E Trace completed");

    return new Response(
      JSON.stringify({
        success: true,
        issueTitle: finalTitle,
        classes: finalClasses.length ? finalClasses : (finalTop ? [finalTop] : []),
        top: finalTop || geminiResult?.issueType || null,
        predictions: finalPredictions,
        annotatedImage: finalAnnotatedImage,
        confidence: finalConfidence,
        reason: finalAction,
        potentialRisk: finalRisk,
        recommendedPriority: finalPriority,
        category: finalCategory,
        department: finalDepartment,
        supportingDepartments: finalSupportingDepts,
        requiresMultipleDepartments: finalRequiresMultiple,
        estimatedResponseTime: getEstimatedResponseTime(finalPriority),
        provider: geminiResult ? (rfResult ? "hybrid" : "google") : "roboflow",
        latencyMs: totalTime,
        geminiError,
        rfError
      }),
      {
        headers: { ...Object.fromEntries(headers.entries()), "Content-Type": "application/json" },
      }
    );
  } catch (e) {
    console.error("detect-issue error:", e);
    await logSecurityEvent("server_error", { error: e instanceof Error ? e.message : "Unknown" }, userId, clientIp);
    return new Response(JSON.stringify({ error: "An unexpected error occurred during processing." }), {
      status: 500,
      headers: { ...Object.fromEntries(headers.entries()), "Content-Type": "application/json" },
    });
  }
});
