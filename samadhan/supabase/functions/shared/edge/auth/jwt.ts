import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface VerifyResult {
  user: any;
  error: string | null;
  status: number;
}

/**
 * Extracts and verifies the Supabase JWT from the Authorization header.
 * Calls supabase.auth.getUser() to confirm the token is valid, unexpired, and authentic.
 */
export async function verifyUser(req: Request): Promise<VerifyResult> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return { user: null, error: "Missing Authorization header", status: 401 };
  }

  const tokenParts = authHeader.split(" ");
  if (tokenParts.length !== 2 || tokenParts[0].toLowerCase() !== "bearer") {
    return { user: null, error: "Malformed Authorization header", status: 401 };
  }

  const token = tokenParts[1];
  if (!token || token.trim() === "") {
    return { user: null, error: "Empty token provided", status: 401 };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      user: null,
      error: "Supabase environment configuration missing on edge",
      status: 500,
    };
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return {
        user: null,
        error: error?.message ?? "Invalid or expired token",
        status: 401,
      };
    }

    return { user, error: null, status: 200 };
  } catch (err: any) {
    return {
      user: null,
      error: err?.message ?? "Token verification failed",
      status: 401,
    };
  }
}
