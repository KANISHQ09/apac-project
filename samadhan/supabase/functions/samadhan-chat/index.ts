import { verifyUser } from "../shared/edge/auth/jwt.ts";
import { getCorsAndSecurityHeaders } from "../shared/edge/middleware/cors.ts";
import { checkRateLimit } from "../shared/edge/middleware/rateLimit.ts";
import { logSecurityEvent } from "../shared/edge/services/securityLogger.ts";
import { scanForPromptInjection, sanitizeInput } from "../shared/edge/ai/guardrails.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const SYSTEM_PROMPT = `You are Samadhan AI, a helpful civic governance assistant for Indian citizens. You specialize in:

1. **Civic Issues**: Help users understand how to report civic problems (roads, water, electricity, sanitation), track their status, and escalate issues appropriately.

2. **Government Schemes**: Provide accurate information about central and state government schemes like PM Kisan, Ayushman Bharat, PM Awas Yojana, MGNREGA, etc. Explain eligibility criteria, benefits, and application processes.

3. **Form Assistance**: Help users understand government forms, explain required documents, and guide them through filling applications.

4. **Document Guidance**: Advise on important documents (Aadhaar, PAN, Voter ID, Income Certificate, Caste Certificate, etc.) - how to apply, renew, or correct them.

Guidelines:
- Be warm, patient, and accessible - many users may not be tech-savvy
- Support both Hindi and English naturally in conversation (code-mixing is fine)
- Provide step-by-step guidance when explaining processes
- Always verify policy information and mention if something might have changed recently
- For complex queries, break down information into digestible parts
- If asked about something outside your scope, politely redirect to appropriate resources
- Never provide legal advice - recommend consulting lawyers for legal matters
- Be culturally sensitive and respectful of Indian customs and diversity

Start responses naturally without unnecessary greetings in follow-up messages. Be concise but thorough.`;

// Zod schemas for validation
const messageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().min(1, "Message content is required").max(4000, "Message content too long"),
});

const chatPayloadSchema = z.object({
  messages: z.array(messageSchema).min(1, "Messages array must not be empty"),
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

    // 2. Rate Limiting Check: AI Chat limit is 30 requests per minute (60s)
    const rateCheck = await checkRateLimit({
      userId,
      clientIp,
      endpoint: "chat",
      maxRequests: 30,
      windowSeconds: 60,
    });

    if (!rateCheck.allowed) {
      await logSecurityEvent("rate_limit", { endpoint: "chat", limit: 30 }, userId, clientIp);
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
        {
          status: 429,
          headers: { ...Object.fromEntries(headers.entries()), "Content-Type": "application/json" },
        }
      );
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

    const validated = chatPayloadSchema.safeParse(requestBody);
    if (!validated.success) {
      return new Response(
        JSON.stringify({ error: "Validation failed", details: validated.error.flatten() }),
        {
          status: 400,
          headers: { ...Object.fromEntries(headers.entries()), "Content-Type": "application/json" },
        }
      );
    }

    const { messages } = validated.data;

    // 4. Prompt Injection Scans & Sanitization
    const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
    if (lastUserMessage) {
      const injectionCheck = scanForPromptInjection(lastUserMessage.content);
      if (!injectionCheck.passed) {
        await logSecurityEvent(
          "injection_attempt",
          { detail: injectionCheck.reason, blockedContent: lastUserMessage.content },
          userId,
          clientIp
        );
        return new Response(
          JSON.stringify({ error: "Safety policy violation. Request rejected." }),
          {
            status: 403,
            headers: { ...Object.fromEntries(headers.entries()), "Content-Type": "application/json" },
          }
        );
      }

      // Sanitize the message content to prevent XSS / markup script tags
      lastUserMessage.content = sanitizeInput(lastUserMessage.content);
    }

    // 5. Retrieve Google Gemini API Key from Env
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      console.error("GEMINI_API_KEY environment variable is missing");
      return new Response(JSON.stringify({ error: "Internal configuration error" }), {
        status: 500,
        headers: { ...Object.fromEntries(headers.entries()), "Content-Type": "application/json" },
      });
    }

    // Map messages to Gemini structure (role 'assistant' maps to 'model')
    const geminiMessages = messages
      .filter((m: any) => m.role !== "system")
      .map((m: any) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`;

    // Direct fetch to Gemini API
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: geminiMessages,
        systemInstruction: {
          parts: [{ text: SYSTEM_PROMPT }],
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", response.status, errorText);
      await logSecurityEvent("api_error", { service: "gemini_ai", status: response.status }, userId, clientIp);
      
      const isRateLimit = response.status === 429;
      return new Response(
        JSON.stringify({
          error: isRateLimit
            ? "Rate limits exceeded. Please try again in a moment."
            : "Unable to process your request. Please try again.",
        }),
        {
          status: isRateLimit ? 429 : 500,
          headers: { ...Object.fromEntries(headers.entries()), "Content-Type": "application/json" },
        }
      );
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("Gemini stream reader is unavailable");
    }

    const decoder = new TextDecoder();
    const encoder = new TextEncoder();

    // SSE Stream translation for frontend compatibility
    const stream = new ReadableStream({
      async start(controller) {
        let buffer = "";
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            let newlineIndex;
            while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
              const line = buffer.slice(0, newlineIndex).trim();
              buffer = buffer.slice(newlineIndex + 1);

              if (line.startsWith("data: ")) {
                const jsonStr = line.slice(6);
                try {
                  const parsed = JSON.parse(jsonStr);
                  const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
                  if (text) {
                    const sseChunk = `data: ${JSON.stringify({
                      choices: [{ delta: { content: text } }],
                    })}\n\n`;
                    controller.enqueue(encoder.encode(sseChunk));
                  }
                } catch {
                  // Ignore parsing errors on incomplete chunks
                }
              }
            }
          }

          // Send the final DONE event to notify frontend client to close stream
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (e) {
          console.error("Streaming error inside ReadableStream:", e);
          controller.error(e);
        }
      },
    });

    return new Response(stream, {
      headers: { ...Object.fromEntries(headers.entries()), "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("Chat error:", e);
    await logSecurityEvent("server_error", { error: e instanceof Error ? e.message : "Unknown" }, userId, clientIp);
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred" }),
      {
        status: 500,
        headers: { ...Object.fromEntries(headers.entries()), "Content-Type": "application/json" },
      }
    );
  }
});
