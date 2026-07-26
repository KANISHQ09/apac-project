import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";
import { verifyUser } from "../shared/edge/auth/jwt.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  // Retrieve Gemini API Key from Env
  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
  if (!GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY environment variable is missing");
    return new Response(JSON.stringify({ error: "Gemini API key is not configured" }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  // Instantiate Supabase client with service role key to write results bypass RLS
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let userId: string | null = null;
  try {
    const authResult = await verifyUser(req);
    if (authResult.error) {
      return new Response(JSON.stringify({ error: authResult.error }), {
        status: authResult.status || 401,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
    userId = authResult.user.id;
  } catch (err: any) {
    return new Response(JSON.stringify({ error: "Unauthorized: " + err.message }), {
      status: 401,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { issue_id } = body;
    if (!issue_id) {
      return new Response(JSON.stringify({ error: "issue_id is required" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // 1. Fetch issue details
    const { data: issue, error: issueErr } = await supabase
      .from("reported_issues")
      .select("*")
      .eq("id", issue_id)
      .single();

    if (issueErr || !issue) {
      return new Response(JSON.stringify({ error: "Issue not found: " + (issueErr?.message || "") }), {
        status: 404,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Check if there's already an active proposal in review/activated state
    const { data: existingPlans } = await supabase
      .from("ai_coordination_plans")
      .select("id, status")
      .eq("case_id", issue_id)
      .in("status", ["REVIEW_REQUIRED", "ACTIVATED"]);

    let existingPlanId = null;
    if (existingPlans && existingPlans.length > 0) {
      existingPlanId = existingPlans[0].id;
    }

    // 2. Create a new plan row in PENDING state
    const { data: plan, error: createPlanErr } = await supabase
      .from("ai_coordination_plans")
      .insert({
        case_id: issue_id,
        status: "GENERATING",
        model_provider: "google",
        model_name: "gemini-2.5-flash",
        prompt_version: "v1.0",
        supersedes_plan_id: existingPlanId,
      })
      .select()
      .single();

    if (createPlanErr || !plan) {
      return new Response(JSON.stringify({ error: "Failed to create planning record: " + createPlanErr.message }), {
        status: 500,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // 3. Gather nearby context (duplicate detection)
    const { data: nearbyIssues } = await supabase
      .from("reported_issues")
      .select("id, title, description, status, location")
      .eq("category", issue.category)
      .neq("id", issue_id)
      .neq("status", "RESOLVED")
      .neq("status", "REJECTED")
      .limit(5);

    // 4. Construct Gemini prompt
    const systemPrompt = `You are Samadhan AI, a Municipal Coordination Planner.
Your job is to read a citizen's civic grievance, analyze if it is a compound/multi-department issue, and generate a comprehensive coordination plan proposal.

The available municipal departments are:
- water_supply (pipe leaks, water shortages, contaminated water)
- sanitation (garbage disposal, street cleaning, sewage blockages, dead animals)
- electricity (broken streetlights, hanging wires, power cuts, transformer issues)
- roads (potholes, road damage, dividers, resurfacing)
- parks (fallen trees, overgrown parks, broken park benches/lights)
- buildings (unauthorized construction, structural safety, public toilet maintenance)

You must determine the following:
1. Which departments need to participate in resolving this issue.
2. Exactly ONE department MUST be the "LEAD" department (responsible for overall coordination). The others can be "RESPONSIBLE" or "SUPPORTING".
3. A list of sequential tasks to be executed by the participating departments.
4. Dependencies between these tasks to form a directed acyclic graph (DAG). For example, if there is a water leak under a road that caused a pothole, the Water Supply department must fix the leak (Task 1) before the Roads department can patch the pothole (Task 2). Thus, Task 2 depends on Task 1.
5. Realistic SLA durations (in minutes) for each task. (Typical values: 720 for 12h, 1440 for 24h, 2880 for 48h, 4320 for 72h).
6. Immutable coordination explanation logic trace for audit log.

You MUST respond strictly with a JSON object matching the requested schema.`;

    const userPrompt = `Generate a coordination plan for the following civic grievance:
Case Number: ${issue.case_number || "N/A"}
Title: ${issue.title}
Description: ${issue.description}
Category: ${issue.category}
Location: ${issue.location}
Latitude: ${issue.latitude || "N/A"}
Longitude: ${issue.longitude || "N/A"}

Nearby active issues in the same category:
${JSON.stringify(nearbyIssues || [])}

Analyze the case. Make sure task dependencies form a logical, cycle-free order.`;

    // 5. Call Gemini API
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    
    const response = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              explanation: {
                type: "STRING",
                description: "A concise explanation of the coordination strategy and dependency sequencing logic."
              },
              confidence: {
                type: "NUMBER",
                description: "Confidence score in this plan from 0.0 to 1.0."
              },
              risk_level: {
                type: "STRING",
                enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
                description: "Estimated risk level/complexity."
              },
              participants: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    department: {
                      type: "STRING",
                      enum: ["water_supply", "sanitation", "electricity", "roads", "parks", "buildings"]
                    },
                    participation_role: {
                      type: "STRING",
                      enum: ["LEAD", "RESPONSIBLE", "SUPPORTING", "CONSULTED"]
                    },
                    responsibility_reason: {
                      type: "STRING",
                      description: "Reasoning for assigning this department and role."
                    }
                  },
                  required: ["department", "participation_role", "responsibility_reason"]
                }
              },
              tasks: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    temp_id: {
                      type: "STRING",
                      description: "Temporary ID e.g. T1, T2, T3"
                    },
                    department: {
                      type: "STRING",
                      enum: ["water_supply", "sanitation", "electricity", "roads", "parks", "buildings"]
                    },
                    title: {
                      type: "STRING",
                      description: "Action-oriented task title."
                    },
                    description: {
                      type: "STRING",
                      description: "Execution instructions for this task."
                    },
                    priority: {
                      type: "STRING",
                      enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"]
                    },
                    sla_duration_minutes: {
                      type: "INTEGER",
                      description: "Task SLA duration in minutes."
                    }
                  },
                  required: ["temp_id", "department", "title", "description", "priority", "sla_duration_minutes"]
                }
              },
              dependencies: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    predecessor_temp_id: {
                      type: "STRING",
                      description: "The temp_id of predecessor task."
                    },
                    successor_temp_id: {
                      type: "STRING",
                      description: "The temp_id of successor task."
                    },
                    reason: {
                      type: "STRING",
                      description: "Why predecessor must complete before successor starts."
                    }
                  },
                  required: ["predecessor_temp_id", "successor_temp_id", "reason"]
                }
              }
            },
            required: ["explanation", "confidence", "risk_level", "participants", "tasks", "dependencies"]
          }
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${errText}`);
    }

    const geminiData = await response.json();
    const resultText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!resultText) {
      throw new Error("Empty response from Gemini");
    }

    const generatedPlan = JSON.parse(resultText);

    // 6. Write proposal details into DB transactionally / sequentially
    // A. Update the plan meta with generated results
    await supabase
      .from("ai_coordination_plans")
      .update({
        status: "REVIEW_REQUIRED",
        raw_model_response: geminiData,
        validated_plan: generatedPlan,
        confidence: generatedPlan.confidence || 0.85,
        risk_level: generatedPlan.risk_level || "MEDIUM",
        explanation: generatedPlan.explanation,
        generation_completed_at: new Date().toISOString(),
      })
      .eq("id", plan.id);

    // B. Insert participants
    if (generatedPlan.participants && generatedPlan.participants.length > 0) {
      const participantRows = generatedPlan.participants.map((p: any) => ({
        plan_id: plan.id,
        department: p.department,
        participation_role: p.participation_role,
        responsibility_reason: p.responsibility_reason,
      }));
      await supabase.from("ai_plan_participants").insert(participantRows);
    }

    // C. Insert tasks
    if (generatedPlan.tasks && generatedPlan.tasks.length > 0) {
      const taskRows = generatedPlan.tasks.map((t: any) => ({
        plan_id: plan.id,
        temp_id: t.temp_id,
        department: t.department,
        title: t.title,
        description: t.description,
        priority: t.priority,
        sla_duration_minutes: t.sla_duration_minutes,
      }));
      await supabase.from("ai_plan_tasks").insert(taskRows);
    }

    // D. Insert dependencies
    if (generatedPlan.dependencies && generatedPlan.dependencies.length > 0) {
      const depRows = generatedPlan.dependencies.map((d: any) => ({
        plan_id: plan.id,
        predecessor_temp_id: d.predecessor_temp_id,
        successor_temp_id: d.successor_temp_id,
        reason: d.reason,
      }));
      await supabase.from("ai_plan_dependencies").insert(depRows);
    }

    return new Response(JSON.stringify({ status: "success", plan_id: plan.id, plan: generatedPlan }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("Plan generation error:", err);
    // If possible, mark the plan as failed
    return new Response(JSON.stringify({ error: err.message || "Plan generation failed" }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
