import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { hashIP } from "../middleware/rateLimit.ts";

/**
 * Logs a security event to the public.security_logs table.
 * Automatically hashes client IP to preserve privacy.
 */
export async function logSecurityEvent(
  eventType: string,
  details: any,
  userId?: string | null,
  clientIp?: string | null
) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Supabase config missing, cannot log security event.");
    return;
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const hashedIp = clientIp ? await hashIP(clientIp) : null;

    const { error } = await supabase.from("security_logs").insert({
      event_type: eventType,
      user_id: userId || null,
      ip_address: hashedIp,
      details,
    });

    if (error) {
      console.error("Failed to insert security log:", error);
    }
  } catch (err) {
    console.error("Security logger exception:", err);
  }
}
