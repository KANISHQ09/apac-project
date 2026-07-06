import { z } from "zod";

const environmentSchema = z.object({
  VITE_SUPABASE_URL: z.string().url("VITE_SUPABASE_URL must be a valid URL"),
  VITE_SUPABASE_PUBLISHABLE_KEY: z.string().min(1, "VITE_SUPABASE_PUBLISHABLE_KEY is required"),
  VITE_FORM_KB_SUPABASE_URL: z.string().url("VITE_FORM_KB_SUPABASE_URL must be a valid URL").optional(),
  VITE_FORM_KB_SUPABASE_ANON_KEY: z.string().min(1, "VITE_FORM_KB_SUPABASE_ANON_KEY is required").optional(),
});

let envParsed: z.infer<typeof environmentSchema>;

try {
  envParsed = environmentSchema.parse({
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    VITE_FORM_KB_SUPABASE_URL: import.meta.env.VITE_FORM_KB_SUPABASE_URL,
    VITE_FORM_KB_SUPABASE_ANON_KEY: import.meta.env.VITE_FORM_KB_SUPABASE_ANON_KEY,
  });
} catch (error) {
  console.error("❌ Environment configuration validation failed:", error);
  // Fail-safe default in case we are in testing/build environments that lack dynamic variables
  envParsed = {
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL || "https://placeholder.supabase.co",
    VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "placeholder-key",
    VITE_FORM_KB_SUPABASE_URL: import.meta.env.VITE_FORM_KB_SUPABASE_URL || "https://placeholder.supabase.co",
    VITE_FORM_KB_SUPABASE_ANON_KEY: import.meta.env.VITE_FORM_KB_SUPABASE_ANON_KEY || "placeholder-key",
  };
}

export const env = {
  supabaseUrl: envParsed.VITE_SUPABASE_URL,
  supabasePublishableKey: envParsed.VITE_SUPABASE_PUBLISHABLE_KEY,
  formKbSupabaseUrl: envParsed.VITE_FORM_KB_SUPABASE_URL,
  formKbSupabaseAnonKey: envParsed.VITE_FORM_KB_SUPABASE_ANON_KEY,
  isDev: import.meta.env.DEV,
  isProd: import.meta.env.PROD,
} as const;
