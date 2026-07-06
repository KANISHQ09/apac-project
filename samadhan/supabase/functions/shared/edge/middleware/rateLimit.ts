import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Computes a SHA-256 fingerprint hash of the client IP to ensure compliance with privacy laws.
 */
export async function hashIP(ip: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = Deno.env.get("IP_SALT") || "samadhan_default_salt_2026";
  const data = encoder.encode(ip + salt);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface RateLimitOptions {
  userId?: string | null;
  clientIp: string;
  endpoint: "auth" | "chat" | "detect" | "admin";
  maxRequests: number;
  windowSeconds: number;
}

/**
 * Executes a database-backed rate limit check.
 * Falls back to hashed IP if user ID is not present.
 */
export async function checkRateLimit(options: RateLimitOptions): Promise<{
  allowed: boolean;
  error: string | null;
}> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseServiceKey) {
    return { allowed: true, error: "Supabase credentials missing on edge" };
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const hashedIp = await hashIP(options.clientIp);
    const limitKey = options.userId || hashedIp;

    const { data: allowed, error } = await supabase.rpc("check_rate_limit", {
      _key: limitKey,
      _endpoint: options.endpoint,
      _max_requests: options.maxRequests,
      _window_seconds: options.windowSeconds,
    });

    if (error) {
      console.error("Rate limit RPC error:", error);
      return { allowed: true, error: error.message }; // Fallback open on RPC error
    }

    return { allowed: !!allowed, error: null };
  } catch (err: any) {
    console.error("Rate limiter exception:", err);
    return { allowed: true, error: err?.message ?? "Limiter error" };
  }
}
