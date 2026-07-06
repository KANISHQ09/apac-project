const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:3000",
];

/**
 * Returns response headers configured with CORS controls and enterprise-grade security headers.
 */
export function getCorsAndSecurityHeaders(req: Request): Headers {
  const origin = req.headers.get("Origin");
  const headers = new Headers();

  // CORS Configuration
  if (origin) {
    const envOrigins = Deno.env.get("CORS_ALLOWED_ORIGINS")?.split(",") || [];
    const isAllowed =
      ALLOWED_ORIGINS.includes(origin) ||
      origin.endsWith(".supabase.co") ||
      envOrigins.includes(origin);

    if (isAllowed) {
      headers.set("Access-Control-Allow-Origin", origin);
    } else if (Deno.env.get("ENVIRONMENT") === "development" || !Deno.env.get("ENVIRONMENT")) {
      // Fallback for development if no environment is defined
      headers.set("Access-Control-Allow-Origin", origin);
    }
  }

  headers.set(
    "Access-Control-Allow-Headers",
    "authorization, x-client-info, apikey, content-type"
  );
  headers.set("Access-Control-Allow-Methods", "POST, GET, OPTIONS");

  // Enterprise Security Headers
  headers.set(
    "Content-Security-Policy",
    "default-src 'self'; frame-ancestors 'none'; object-src 'none';"
  );
  headers.set("X-Frame-Options", "DENY");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set(
    "Permissions-Policy",
    "geolocation=(), microphone=(), camera=(), interest-cohort=()"
  );

  return headers;
}
