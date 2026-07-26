import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";
import { verifyUser } from "../shared/edge/auth/jwt.ts";
import { getCorsAndSecurityHeaders } from "../shared/edge/middleware/cors.ts";
import { checkRateLimit } from "../shared/edge/middleware/rateLimit.ts";
import { logSecurityEvent } from "../shared/edge/services/securityLogger.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function deterministicTriage(category: string, title: string, description: string) {
  const normCategory = (category || "").toLowerCase();
  const text = ((title || "") + " " + (description || "")).toLowerCase();
  
  let primaryDepartment = "water_supply";
  let additionalDepartments: string[] = [];
  let severity = "MEDIUM";
  const confidence = 0.90;
  
  // Category mapping
  if (normCategory.includes("water") || text.includes("leak") || text.includes("sewage") || text.includes("pipe") || text.includes("drain") || text.includes("flooding") || text.includes("supply")) {
    primaryDepartment = "water_supply";
    if (text.includes("drain") || text.includes("garbage") || text.includes("sewage")) {
      additionalDepartments.push("sanitation");
    }
  } else if (normCategory.includes("sanitation") || normCategory.includes("garbage") || normCategory.includes("waste") || text.includes("garbage") || text.includes("trash") || text.includes("clean") || text.includes("dump")) {
    primaryDepartment = "sanitation";
    if (text.includes("water") || text.includes("drain") || text.includes("flood")) {
      additionalDepartments.push("water_supply");
    }
  } else if (normCategory.includes("electricity") || normCategory.includes("power") || text.includes("wire") || text.includes("light") || text.includes("electricity") || text.includes("outage") || text.includes("pole") || text.includes("blackout")) {
    primaryDepartment = "electricity";
    if (text.includes("road") || text.includes("pole")) {
      additionalDepartments.push("roads");
    }
  } else if (normCategory.includes("road") || normCategory.includes("pothole") || text.includes("pothole") || text.includes("street") || text.includes("tarmac") || text.includes("asphalt")) {
    primaryDepartment = "roads";
    if (text.includes("water") || text.includes("pipe") || text.includes("leak")) {
      additionalDepartments.push("water_supply");
    }
  } else if (normCategory.includes("park") || text.includes("tree") || text.includes("garden") || text.includes("grass") || text.includes("branches")) {
    primaryDepartment = "parks";
    if (text.includes("light") || text.includes("wire")) {
      additionalDepartments.push("electricity");
    }
  } else if (normCategory.includes("building") || text.includes("structure") || text.includes("wall") || text.includes("roof") || text.includes("concrete") || text.includes("hazard")) {
    primaryDepartment = "buildings";
  }
  
  // Severity heuristics
  if (text.includes("urgent") || text.includes("danger") || text.includes("flood") || text.includes("critical") || text.includes("burst") || text.includes("spark") || text.includes("fire")) {
    severity = "CRITICAL";
  } else if (text.includes("broken") || text.includes("outage") || text.includes("block") || text.includes("heavy")) {
    severity = "HIGH";
  } else if (text.includes("slow") || text.includes("minor") || text.includes("dirty") || text.includes("smell")) {
    severity = "MEDIUM";
  } else {
    severity = "LOW";
  }
  
  // Dedup additional
  additionalDepartments = [...new Set(additionalDepartments)].filter(d => d !== primaryDepartment);
  
  return { primaryDepartment, additionalDepartments, severity, confidence };
}

function generateFallbackPlanJson(primary: string, additional: string[], severity: string, issueTitle: string): string {
  const reasoningSummary = `Rule-based fallback coordination plan generated for issue: ${issueTitle}. Gemini API timed out or failed.`;
  const recommendedNextAction = `Verify the assigned department tasks and click 'Approve and Activate' to begin operations.`;
  
  const tasks: any[] = [];
  
  if (primary === "water_supply") {
    tasks.push(
      {
        clientKey: "T1",
        title: "Inspect reported leak and locate main valve",
        description: "Verify the leak location, inspect nearby infrastructure, and identify the main control valve.",
        recommendedOwnerDepartmentKey: "water_supply",
        sequence: 1,
        dependsOnClientKeys: [],
        estimatedMinutes: 60,
        evidenceRequired: true,
        evidenceTypes: ["PHOTO"],
        priority: "HIGH"
      },
      {
        clientKey: "T2",
        title: "Isolate affected pipes and control valve",
        description: "Shut off the local control valve to stop water flow and prevent flooding at the site.",
        recommendedOwnerDepartmentKey: "water_supply",
        sequence: 2,
        dependsOnClientKeys: ["T1"],
        estimatedMinutes: 120,
        evidenceRequired: false,
        evidenceTypes: [],
        priority: "HIGH"
      },
      {
        clientKey: "T3",
        title: "Repair damaged pipes or replace valve",
        description: "Excavate the site if necessary, cut out the damaged section, and install replacement pipe/valve.",
        recommendedOwnerDepartmentKey: "water_supply",
        sequence: 3,
        dependsOnClientKeys: ["T2"],
        estimatedMinutes: 240,
        evidenceRequired: true,
        evidenceTypes: ["PHOTO"],
        priority: "HIGH"
      }
    );
    
    if (additional.includes("sanitation")) {
      tasks.push({
        clientKey: "T4",
        title: "Clean standing water and mud from roadways",
        description: "Remove mud, clean debris, and restore clear path around the repair site.",
        recommendedOwnerDepartmentKey: "sanitation",
        sequence: 4,
        dependsOnClientKeys: ["T3"],
        estimatedMinutes: 180,
        evidenceRequired: false,
        evidenceTypes: [],
        priority: "MEDIUM"
      });
      tasks.push({
        clientKey: "T5",
        title: "Verify pressure and close case",
        description: "Restore water flow, test service pressure at adjacent properties, and close work order.",
        recommendedOwnerDepartmentKey: "water_supply",
        sequence: 5,
        dependsOnClientKeys: ["T4"],
        estimatedMinutes: 60,
        evidenceRequired: true,
        evidenceTypes: ["PHOTO"],
        priority: "MEDIUM"
      });
    } else {
      tasks.push({
        clientKey: "T4",
        title: "Verify pressure and close case",
        description: "Restore water flow, test service pressure at adjacent properties, and close work order.",
        recommendedOwnerDepartmentKey: "water_supply",
        sequence: 4,
        dependsOnClientKeys: ["T3"],
        estimatedMinutes: 60,
        evidenceRequired: true,
        evidenceTypes: ["PHOTO"],
        priority: "MEDIUM"
      });
    }
  } else if (primary === "sanitation") {
    tasks.push(
      {
        clientKey: "T1",
        title: "Inspect waste pile and estimate cleanup resources",
        description: "Determine type of waste, volume, and required transport vehicles/staff.",
        recommendedOwnerDepartmentKey: "sanitation",
        sequence: 1,
        dependsOnClientKeys: [],
        estimatedMinutes: 60,
        evidenceRequired: false,
        evidenceTypes: [],
        priority: "MEDIUM"
      },
      {
        clientKey: "T2",
        title: "Clear waste pile and dispatch garbage truck",
        description: "Load all waste and debris into municipal garbage trucks for disposal.",
        recommendedOwnerDepartmentKey: "sanitation",
        sequence: 2,
        dependsOnClientKeys: ["T1"],
        estimatedMinutes: 180,
        evidenceRequired: true,
        evidenceTypes: ["PHOTO"],
        priority: "HIGH"
      },
      {
        clientKey: "T3",
        title: "Decontaminate ground and install bins",
        description: "Spray disinfectant on cleared ground and set up standard color-coded trash bins.",
        recommendedOwnerDepartmentKey: "sanitation",
        sequence: 3,
        dependsOnClientKeys: ["T2"],
        estimatedMinutes: 120,
        evidenceRequired: false,
        evidenceTypes: [],
        priority: "MEDIUM"
      },
      {
        clientKey: "T4",
        title: "Verify area cleanliness and complete case",
        description: "Take final validation photos and close the case.",
        recommendedOwnerDepartmentKey: "sanitation",
        sequence: 4,
        dependsOnClientKeys: ["T3"],
        estimatedMinutes: 60,
        evidenceRequired: true,
        evidenceTypes: ["PHOTO"],
        priority: "LOW"
      }
    );
  } else if (primary === "electricity") {
    tasks.push(
      {
        clientKey: "T1",
        title: "Inspect and secure electrical hazard site",
        description: "Set up warning markers and block off access to exposed cables or damaged pole.",
        recommendedOwnerDepartmentKey: "electricity",
        sequence: 1,
        dependsOnClientKeys: [],
        estimatedMinutes: 60,
        evidenceRequired: true,
        evidenceTypes: ["PHOTO"],
        priority: "CRITICAL"
      },
      {
        clientKey: "T2",
        title: "Isolate grid segment and repair wiring",
        description: "De-energize the circuit, splice/replace broken wires or fixtures.",
        recommendedOwnerDepartmentKey: "electricity",
        sequence: 2,
        dependsOnClientKeys: ["T1"],
        estimatedMinutes: 180,
        evidenceRequired: false,
        evidenceTypes: [],
        priority: "HIGH"
      },
      {
        clientKey: "T3",
        title: "Re-energize grid and verify power restoration",
        description: "Restore supply current, test voltage stability, and close the issue.",
        recommendedOwnerDepartmentKey: "electricity",
        sequence: 3,
        dependsOnClientKeys: ["T2"],
        estimatedMinutes: 60,
        evidenceRequired: true,
        evidenceTypes: ["PHOTO"],
        priority: "HIGH"
      }
    );
  } else if (primary === "roads") {
    tasks.push(
      {
        clientKey: "T1",
        title: "Establish road safety zone and signage",
        description: "Position traffic cones and caution sign boards to redirect vehicle lanes.",
        recommendedOwnerDepartmentKey: "roads",
        sequence: 1,
        dependsOnClientKeys: [],
        estimatedMinutes: 60,
        evidenceRequired: false,
        evidenceTypes: [],
        priority: "HIGH"
      },
      {
        clientKey: "T2",
        title: "Repair pothole/damaged roadway surface",
        description: "Excavate base layer, lay down crushed stone aggregate, pour asphalt, and roll flat.",
        recommendedOwnerDepartmentKey: "roads",
        sequence: 2,
        dependsOnClientKeys: ["T1"],
        estimatedMinutes: 240,
        evidenceRequired: true,
        evidenceTypes: ["PHOTO"],
        priority: "HIGH"
      },
      {
        clientKey: "T3",
        title: "Clear asphalt debris and clean area",
        description: "Sweep up excess gravel/bitumen and inspect repair flatness.",
        recommendedOwnerDepartmentKey: "roads",
        sequence: 3,
        dependsOnClientKeys: ["T2"],
        estimatedMinutes: 120,
        evidenceRequired: false,
        evidenceTypes: [],
        priority: "MEDIUM"
      },
      {
        clientKey: "T4",
        title: "Reopen traffic lanes and close case",
        description: "Remove signage/cones, confirm safety, and close work order.",
        recommendedOwnerDepartmentKey: "roads",
        sequence: 4,
        dependsOnClientKeys: ["T3"],
        estimatedMinutes: 60,
        evidenceRequired: true,
        evidenceTypes: ["PHOTO"],
        priority: "MEDIUM"
      }
    );
  } else {
    tasks.push(
      {
        clientKey: "T1",
        title: "Inspect site and draft action checklist",
        description: "Conduct preliminary inspection to determine required parts and staff.",
        recommendedOwnerDepartmentKey: primary,
        sequence: 1,
        dependsOnClientKeys: [],
        estimatedMinutes: 120,
        evidenceRequired: false,
        evidenceTypes: [],
        priority: "MEDIUM"
      },
      {
        clientKey: "T2",
        title: "Execute field repairs",
        description: "Address the core grievance using standard department procedures.",
        recommendedOwnerDepartmentKey: primary,
        sequence: 2,
        dependsOnClientKeys: ["T1"],
        estimatedMinutes: 360,
        evidenceRequired: true,
        evidenceTypes: ["PHOTO"],
        priority: "HIGH"
      },
      {
        clientKey: "T3",
        title: "Verify repair work and clean up site",
        description: "Verify quality of completed tasks and remove any equipment.",
        recommendedOwnerDepartmentKey: primary,
        sequence: 3,
        dependsOnClientKeys: ["T2"],
        estimatedMinutes: 120,
        evidenceRequired: true,
        evidenceTypes: ["PHOTO"],
        priority: "MEDIUM"
      }
    );
  }
  
  const mappedTasks = tasks.map(t => ({
    ...t,
    fieldInstructions: `Verify coordinates and check local parameters before executing: ${t.title}.`,
    safetyNotes: "Ensure site safety barricading is active and wear high-visibility PPE.",
    evidenceChecklist: [
      `Inspect work site for ${t.title}`,
      t.evidenceRequired ? "Capture clear photograph showing resolved status" : "Verify that quality guidelines are met"
    ]
  }));

  return JSON.stringify({
    primaryDepartment: primary,
    additionalDepartments: additional,
    severity,
    confidence: 0.90,
    reasoningSummary,
    executiveSummary: `Response strategy to resolve ${issueTitle} by deploying resources from ${primary}${additional.length > 0 ? ' and ' + additional.join(', ') : ''}.`,
    citizenImpact: `Restores normal civic operations, clears safety hazards, and secures the area for public use.`,
    departmentReasons: {
      water_supply: "Handles water pipeline pressure isolation, repairs, and supply restoration.",
      sanitation: "Manages cleanliness, mud clearance, and waste decontamination at the site.",
      electricity: "Secures power lines, isolates grid segments, and restores streetlighting.",
      roads: "Restores road surface, pothole filling, and manages local traffic redirection.",
      parks: "Manages fallen tree clearing and park area safety recovery.",
      buildings: "Addresses structural integrity checks and concrete hazard mitigation."
    },
    recommendedNextAction,
    recommendedTasks: mappedTasks
  });
}

Deno.serve(async (req) => {
  const headers = getCorsAndSecurityHeaders(req);

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "127.0.0.1";
  let userId: string | null = null;

  // Retrieve Supabase Client & Secrets
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Retrieve API Keys
  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  const geminiModel = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";
  const nvidiaKey = Deno.env.get("NVIDIA_NIM_API_KEY") || Deno.env.get("NVIDIA_API_KEY");
  const nvidiaModel = Deno.env.get("NVIDIA_MODEL") || "nvidia/nemotron-3-nano-30b-a3b";

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...Object.fromEntries(headers.entries()), "Content-Type": "application/json" },
    });
  }

  const caseId = body.caseId || body.issue_id || body.issueId;
  if (!caseId) {
    return new Response(JSON.stringify({ error: "caseId is required" }), {
      status: 400,
      headers: { ...Object.fromEntries(headers.entries()), "Content-Type": "application/json" },
    });
  }

  const requestStartedAt = new Date().toISOString();

  try {
    // 1. JWT Authentication Verification
    const authResult = await verifyUser(req);
    if (authResult.error) {
      await logSecurityEvent("auth_failure", { error: authResult.error }, null, clientIp);
      return new Response(JSON.stringify({ error: authResult.error }), {
        status: authResult.status || 401,
        headers: { ...Object.fromEntries(headers.entries()), "Content-Type": "application/json" },
      });
    }
    userId = authResult.user.id;

    // 2. Rate Limiting Check: 10 requests per hour (3600s)
    const rateCheck = await checkRateLimit({
      userId,
      clientIp,
      endpoint: "classify",
      maxRequests: 10,
      windowSeconds: 3600,
    });

    if (!rateCheck.allowed) {
      await logSecurityEvent("rate_limit", { endpoint: "classify", limit: 10 }, userId, clientIp);
      return new Response(JSON.stringify({ error: "Too many requests. Limit is 10 requests per hour." }), {
        status: 429,
        headers: { ...Object.fromEntries(headers.entries()), "Content-Type": "application/json" },
      });
    }

    // Concurrency / Idempotency check
    const { data: currentIssue, error: currentErr } = await supabase
      .from("reported_issues")
      .select("ai_status, ai_request_started_at")
      .eq("id", caseId)
      .single();

    if (currentErr) {
      throw new Error(`Failed to fetch issue status: ${currentErr.message}`);
    }

    if (currentIssue?.ai_status === "analyzing") {
      const startedAt = currentIssue.ai_request_started_at ? new Date(currentIssue.ai_request_started_at).getTime() : 0;
      if (startedAt > 0 && (Date.now() - startedAt) < 15000) {
        console.log(`AI planning already in progress for issue ${caseId}. Returning early.`);
        return new Response(JSON.stringify({ status: "in_progress", message: "Planning already in progress" }), {
          headers: { ...Object.fromEntries(headers.entries()), "Content-Type": "application/json" },
        });
      }
    }

    // Update status to 'analyzing' and track request started timestamp
    await supabase
      .from("reported_issues")
      .update({
        ai_status: "analyzing",
        ai_request_started_at: requestStartedAt
      })
      .eq("id", caseId);

    // 3. Fetch Case details
    const { data: issue, error: issueErr } = await supabase
      .from("reported_issues")
      .select("*")
      .eq("id", caseId)
      .single();

    if (issueErr || !issue) {
      throw new Error(`Failed to fetch issue details: ${issueErr?.message || "Not found"}`);
    }

    // Phase A: Immediate Triage (<300ms)
    const triage = deterministicTriage(issue.category, issue.title, issue.description || "");

    // Save triage immediately to reported_issues
    await supabase
      .from("reported_issues")
      .update({
        lead_department: triage.primaryDepartment,
        severity: triage.severity,
        coordination_type: triage.additionalDepartments.length > 0 ? "multi_department" : "single_department"
      })
      .eq("id", caseId);

    // Sync LEAD in case_participations
    const { data: existingLeadPart } = await supabase
      .from("case_participations")
      .select("id, department")
      .eq("case_id", caseId)
      .eq("participation_role", "LEAD")
      .eq("status", "ACTIVE")
      .maybeSingle();

    if (existingLeadPart) {
      if (existingLeadPart.department !== triage.primaryDepartment) {
        await supabase
          .from("case_participations")
          .update({ department: triage.primaryDepartment })
          .eq("id", existingLeadPart.id);
      }
    } else {
      await supabase
        .from("case_participations")
        .insert({
          case_id: caseId,
          department: triage.primaryDepartment,
          participation_role: "LEAD",
          status: "ACTIVE",
          added_source: "SYSTEM_BACKFILL",
          responsibility_reason: "Immediate triage lead assignment"
        });
    }

    // Insert any additional departments
    for (const dept of triage.additionalDepartments) {
      const { data: extPart } = await supabase
        .from("case_participations")
        .select("id")
        .eq("case_id", caseId)
        .eq("department", dept)
        .eq("status", "ACTIVE")
        .maybeSingle();
      if (!extPart) {
        await supabase
          .from("case_participations")
          .insert({
            case_id: caseId,
            department: dept,
            participation_role: "SUPPORTING",
            status: "ACTIVE",
            added_source: "SYSTEM_BACKFILL",
            responsibility_reason: "Immediate triage support candidate assignment"
          });
      }
    }

    // 4. Construct compact production prompt
    const systemPrompt = `You are an operational civic-response planner for Samadhan. Analyze citizen reports and produce a concise, evidence-grounded draft response plan. Use only allowed department keys: water_supply, sanitation, electricity, roads, parks, buildings. Never invent IDs, completed work, signoffs, or evidence. Recommend the minimum departments necessary. Tasks must be specific, dependency-aware, and executable. Output only the required structured schema. Provide a complete executive summary of the response plan, explain the citizen impact, specify the department reasons for each involved department, and for each recommended task supply detailed field instructions, safety notes, and a custom evidence checklist.`;

    const userPrompt = `Grievance details:
Title: ${issue.title}
Description: ${issue.description || "No description provided."}
Category: ${issue.category}
Location: ${issue.location || "Unknown"}
Latitude: ${issue.latitude || "N/A"}
Longitude: ${issue.longitude || "N/A"}
Support Count: ${issue.supports_count || 0}
Image URLs count: ${Array.isArray(issue.image_urls) ? issue.image_urls.length : 0}

Analyze the details. If the description is weak or short, lower your confidence and recommend human verification inside next action. Make sure task dependencies form a logical, cycle-free sequence. Make sure to generate the executiveSummary, citizenImpact, departmentReasons (mapping department key to the reason they are involved), and task-specific fieldInstructions, safetyNotes, and evidenceChecklist.`;

    let cleanedOutput = "";
    let providerName = "google";
    let modelNameUsed = geminiModel;
    let responseReceivedAt = new Date().toISOString();

    // 5. Call API (Gemini with safe deterministic fallback)
    try {
      if (geminiKey) {
        const controller = new AbortController();
        const tId = setTimeout(() => controller.abort(), 4000); // 4.0s fast timeout target

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`;

        const response = await fetch(geminiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: userPrompt }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] },
            generationConfig: {
              responseMimeType: "application/json",
              maxOutputTokens: 1024,
              temperature: 0.1,
              responseSchema: {
                type: "OBJECT",
                properties: {
                  primaryDepartment: {
                    type: "STRING",
                    enum: ["water_supply", "sanitation", "electricity", "roads", "parks", "buildings"]
                  },
                  additionalDepartments: {
                    type: "ARRAY",
                    items: {
                      type: "STRING",
                      enum: ["water_supply", "sanitation", "electricity", "roads", "parks", "buildings"]
                    }
                  },
                  severity: {
                    type: "STRING",
                    enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"]
                  },
                  confidence: {
                    type: "NUMBER"
                  },
                  reasoningSummary: {
                    type: "STRING"
                  },
                  executiveSummary: {
                    type: "STRING"
                  },
                  citizenImpact: {
                    type: "STRING"
                  },
                  departmentReasons: {
                    type: "OBJECT",
                    properties: {
                      water_supply: { type: "STRING" },
                      sanitation: { type: "STRING" },
                      electricity: { type: "STRING" },
                      roads: { type: "STRING" },
                      parks: { type: "STRING" },
                      buildings: { type: "STRING" }
                    }
                  },
                  recommendedNextAction: {
                    type: "STRING"
                  },
                  recommendedTasks: {
                    type: "ARRAY",
                    items: {
                      type: "OBJECT",
                      properties: {
                        clientKey: { type: "STRING" },
                        title: { type: "STRING" },
                        description: { type: "STRING" },
                        recommendedOwnerDepartmentKey: {
                          type: "STRING",
                          enum: ["water_supply", "sanitation", "electricity", "roads", "parks", "buildings"]
                        },
                        sequence: { type: "INTEGER" },
                        dependsOnClientKeys: {
                          type: "ARRAY",
                          items: { type: "STRING" }
                        },
                        estimatedMinutes: { type: "INTEGER" },
                        evidenceRequired: { type: "BOOLEAN" },
                        evidenceTypes: {
                          type: "ARRAY",
                          items: { type: "STRING" }
                        },
                        priority: {
                          type: "STRING",
                          enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"]
                        },
                        fieldInstructions: { type: "STRING" },
                        safetyNotes: { type: "STRING" },
                        evidenceChecklist: {
                          type: "ARRAY",
                          items: { type: "STRING" }
                        }
                      },
                      required: [
                        "clientKey", "title", "description", "recommendedOwnerDepartmentKey",
                        "sequence", "dependsOnClientKeys", "estimatedMinutes",
                        "evidenceRequired", "evidenceTypes", "priority",
                        "fieldInstructions", "safetyNotes", "evidenceChecklist"
                      ]
                    }
                  }
                },
                required: [
                  "primaryDepartment", "additionalDepartments", "severity",
                  "confidence", "reasoningSummary", "executiveSummary", "citizenImpact", "departmentReasons", "recommendedNextAction", "recommendedTasks"
                ]
              }
            }
          }),
          signal: controller.signal
        });

        clearTimeout(tId);
        responseReceivedAt = new Date().toISOString();

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Gemini API returned error ${response.status}: ${text}`);
        }

        const resData = await response.json();
        cleanedOutput = resData.candidates?.[0]?.content?.parts?.[0]?.text || "";
      } else {
        throw new Error("No Gemini key configured.");
      }
    } catch (apiErr: any) {
      console.warn("AI Generation failed, falling back to deterministic plan:", apiErr.message);
      providerName = "deterministic_fallback";
      modelNameUsed = "rule_based_fallback";
      cleanedOutput = generateFallbackPlanJson(
        triage.primaryDepartment, 
        triage.additionalDepartments, 
        triage.severity, 
        issue.title
      );
      responseReceivedAt = new Date().toISOString();
    }

    if (!cleanedOutput) {
      throw new Error("AI provider returned empty response");
    }

    // Strip markdown formatting if any
    let cleanJson = cleanedOutput;
    if (cleanJson.startsWith("```")) {
      cleanJson = cleanJson.replace(/^```[a-zA-Z]*\n/, "").replace(/\n```$/, "");
    }
    cleanJson = cleanJson.trim();

    const analysis = JSON.parse(cleanJson);

    // Validate departments
    const validDepts = ["water_supply", "sanitation", "electricity", "roads", "parks", "buildings"];
    if (!validDepts.includes(analysis.primaryDepartment)) {
      throw new Error(`Invalid primaryDepartment: ${analysis.primaryDepartment}`);
    }
    if (Array.isArray(analysis.additionalDepartments)) {
      for (const d of analysis.additionalDepartments) {
        if (!validDepts.includes(d)) {
          throw new Error(`Invalid additionalDepartment: ${d}`);
        }
      }
    }
    if (Array.isArray(analysis.recommendedTasks)) {
      for (const t of analysis.recommendedTasks) {
        if (!validDepts.includes(t.recommendedOwnerDepartmentKey)) {
          throw new Error(`Invalid recommendedOwnerDepartmentKey: ${t.recommendedOwnerDepartmentKey}`);
        }
        if (!["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(t.priority)) {
          throw new Error(`Invalid priority in task ${t.clientKey}: ${t.priority}`);
        }
      }
    }

    // 6. Write results to Supabase
    // 6.1 Create AI Coordination Plan in Draft (REVIEW_REQUIRED) status
    const { data: planData, error: planErr } = await supabase
      .from("ai_coordination_plans")
      .insert({
        case_id: caseId,
        status: "REVIEW_REQUIRED",
        model_provider: providerName,
        model_name: modelNameUsed,
        confidence: analysis.confidence || 0.85,
        validated_plan: analysis,
        is_fallback: providerName === "deterministic_fallback"
      })
      .select("id")
      .single();

    if (planErr || !planData) {
      throw new Error(`Failed to create AI coordination plan: ${planErr?.message}`);
    }

    const planId = planData.id;

    // 6.2 Create AI Plan Participants
    const participants = [
      {
        plan_id: planId,
        department: analysis.primaryDepartment,
        participation_role: "LEAD",
        responsibility_reason: analysis.reasoningSummary || "AI recommended lead department."
      }
    ];

    if (Array.isArray(analysis.additionalDepartments)) {
      for (const dept of analysis.additionalDepartments) {
        if (dept !== analysis.primaryDepartment && validDepts.includes(dept)) {
          participants.push({
            plan_id: planId,
            department: dept,
            participation_role: "SUPPORTING",
            responsibility_reason: "AI recommended supporting department."
          });
        }
      }
    }

    const { error: partErr } = await supabase
      .from("ai_plan_participants")
      .insert(participants);

    if (partErr) {
      throw new Error(`Failed to insert plan participants: ${partErr.message}`);
    }

    // 6.3 Create AI Plan Tasks
    if (Array.isArray(analysis.recommendedTasks)) {
      const dbTasks = analysis.recommendedTasks.map((t: any) => ({
        plan_id: planId,
        temp_id: t.clientKey,
        department: t.recommendedOwnerDepartmentKey || analysis.primaryDepartment,
        title: t.title,
        description: t.description || "",
        priority: t.priority || "MEDIUM",
        sla_duration_minutes: Number(t.estimatedMinutes) || 1440,
        completion_evidence_rules: {
          evidenceRequired: !!t.evidenceRequired,
          evidenceTypes: Array.isArray(t.evidenceTypes) ? t.evidenceTypes : [],
          fieldInstructions: t.fieldInstructions || "",
          safetyNotes: t.safetyNotes || "",
          evidenceChecklist: Array.isArray(t.evidenceChecklist) ? t.evidenceChecklist : []
        }
      }));

      const { error: tasksErr } = await supabase
        .from("ai_plan_tasks")
        .insert(dbTasks);

      if (tasksErr) {
        throw new Error(`Failed to insert plan tasks: ${tasksErr.message}`);
      }

      // 6.4 Create AI Plan Dependencies
      const dependencies: any[] = [];
      for (const t of analysis.recommendedTasks) {
        if (Array.isArray(t.dependsOnClientKeys)) {
          for (const predKey of t.dependsOnClientKeys) {
            dependencies.push({
              plan_id: planId,
              predecessor_temp_id: predKey,
              successor_temp_id: t.clientKey,
              reason: "Predecessor task dependency."
            });
          }
        }
      }

      if (dependencies.length > 0) {
        const { error: depErr } = await supabase
          .from("ai_plan_dependencies")
          .insert(dependencies);

        if (depErr) {
          throw new Error(`Failed to insert plan dependencies: ${depErr.message}`);
        }
      }
    }

    const planReadyAt = new Date().toISOString();
    const latencyMs = new Date(planReadyAt).getTime() - new Date(requestStartedAt).getTime();

    // 6.5 Update reported_issues AI analysis metadata & performance telemetry
    const issueUpdates = {
      ai_provider: providerName,
      ai_model: modelNameUsed,
      ai_analyzed_at: planReadyAt,
      ai_confidence: analysis.confidence || 0.85,
      ai_status: "done",
      ai_request_started_at: requestStartedAt,
      ai_response_received_at: responseReceivedAt,
      ai_plan_ready_at: planReadyAt,
      ai_latency_ms: latencyMs
    };

    const { error: updateErr } = await supabase
      .from("reported_issues")
      .update(issueUpdates)
      .eq("id", caseId);

    if (updateErr) {
      throw new Error(`Failed to update issue: ${updateErr.message}`);
    }

    // Log security audit log for AI analysis event
    await logSecurityEvent("ai_analysis_complete", { caseId, model: modelNameUsed, latencyMs }, userId, clientIp);

    return new Response(JSON.stringify({ status: "success", analysis, latencyMs }), {
      headers: { ...Object.fromEntries(headers.entries()), "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("AI Classification failed:", err);
    const planReadyAt = new Date().toISOString();
    const latencyMs = new Date(planReadyAt).getTime() - new Date(requestStartedAt).getTime();

    // Mark as failed in Supabase and write telemetry
    await supabase
      .from("reported_issues")
      .update({
        ai_status: "failed",
        ai_plan_ready_at: planReadyAt,
        ai_latency_ms: latencyMs
      })
      .eq("id", caseId);

    await logSecurityEvent("ai_analysis_failed", { caseId, error: err.message }, userId, clientIp);

    return new Response(JSON.stringify({ error: err.message || "Classification failed" }), {
      status: 500,
      headers: { ...Object.fromEntries(headers.entries()), "Content-Type": "application/json" },
    });
  }
});
