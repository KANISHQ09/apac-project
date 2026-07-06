import { verifyUser } from "../shared/edge/auth/jwt.ts";
import { getCorsAndSecurityHeaders } from "../shared/edge/middleware/cors.ts";
import { checkRateLimit } from "../shared/edge/middleware/rateLimit.ts";
import { logSecurityEvent } from "../shared/edge/services/securityLogger.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const WORKSPACE = "kanishqs-workspace-sqcbc";
const WORKFLOW_ID = "general-segmentation-api-2";

// Zod validation schema for request payload
const detectPayloadSchema = z
  .object({
    imageBase64: z.string().trim().optional(),
    imageUrl: z.string().trim().url("Invalid image URL").optional(),
  })
  .refine((data) => data.imageBase64 || data.imageUrl, {
    message: "Either imageBase64 or imageUrl must be provided",
  });

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

    // 2. Rate Limiting Check: Image Detection is 10 requests per hour (3600s)
    const rateCheck = await checkRateLimit({
      userId,
      clientIp,
      endpoint: "detect",
      maxRequests: 10,
      windowSeconds: 3600,
    });

    if (!rateCheck.allowed) {
      await logSecurityEvent("rate_limit", { endpoint: "detect", limit: 10 }, userId, clientIp);
      return new Response(JSON.stringify({ error: "Too many requests. Limit is 10 requests per hour." }), {
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

    const { imageBase64, imageUrl } = validated.data;

    // 4. Retrieve Secret from Env
    const ROBOFLOW_API_KEY = Deno.env.get("ROBOFLOW_API_KEY");
    if (!ROBOFLOW_API_KEY) {
      console.error("ROBOFLOW_API_KEY environment variable is missing");
      return new Response(JSON.stringify({ error: "Internal configuration error" }), {
        status: 500,
        headers: { ...Object.fromEntries(headers.entries()), "Content-Type": "application/json" },
      });
    }

    const body = {
      api_key: ROBOFLOW_API_KEY,
      inputs: {
        image: imageBase64
          ? { type: "base64", value: imageBase64 }
          : { type: "url", value: imageUrl },
        classes: "Pothole, Garbage, Civic2",
      },
    };

    const resp = await fetch(
      `https://serverless.roboflow.com/infer/workflows/${WORKSPACE}/${WORKFLOW_ID}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );

    const data = await resp.json();
    if (!resp.ok) {
      console.error("Roboflow error:", data);
      await logSecurityEvent("api_error", { service: "roboflow", status: resp.status }, userId, clientIp);
      return new Response(JSON.stringify({ error: "Detection failed", details: data }), {
        status: 500,
        headers: { ...Object.fromEntries(headers.entries()), "Content-Type": "application/json" },
      });
    }

    // Extract predictions/classes
    const outputs = Array.isArray(data?.outputs) ? data.outputs[0] ?? {} : data?.outputs ?? {};
    let predictions: any[] = [];
    let annotatedImage: string | null = null;

    for (const v of Object.values(outputs)) {
      if (v && typeof v === "object") {
        const maybe = (v as any).predictions ?? (v as any).output ?? null;
        if (Array.isArray(maybe)) predictions = maybe;
        else if (maybe?.predictions) predictions = maybe.predictions;
        if ((v as any).type === "base64" && (v as any).value) annotatedImage = (v as any).value;
      }
    }

    const classes = Array.from(
      new Set(predictions.map((p: any) => p.class).filter(Boolean))
    );
    const top = classes[0] || null;

    return new Response(
      JSON.stringify({ success: true, classes, top, predictions, annotatedImage }),
      {
        headers: { ...Object.fromEntries(headers.entries()), "Content-Type": "application/json" },
      }
    );
  } catch (e) {
    console.error("detect-issue error:", e);
    await logSecurityEvent("server_error", { error: e instanceof Error ? e.message : "Unknown" }, userId, clientIp);
    return new Response(JSON.stringify({ error: "An unexpected error occurred" }), {
      status: 500,
      headers: { ...Object.fromEntries(headers.entries()), "Content-Type": "application/json" },
    });
  }
});
