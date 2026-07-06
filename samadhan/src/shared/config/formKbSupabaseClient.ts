import { createClient } from "@supabase/supabase-js";

// This points to the NEW, separate Supabase project that holds the
// Form Analyzer's RAG knowledge base. It is intentionally distinct
// from the main app's Supabase client (used for auth, civic_issues, etc.)
// No user session is attached to this client — the knowledge base is
// public-read and needs no auth.

const FORM_KB_SUPABASE_URL = import.meta.env.VITE_FORM_KB_SUPABASE_URL || "https://placeholder.supabase.co";
const FORM_KB_SUPABASE_ANON_KEY = import.meta.env.VITE_FORM_KB_SUPABASE_ANON_KEY || "placeholder-key";

export const formKbSupabase = createClient(
  FORM_KB_SUPABASE_URL,
  FORM_KB_SUPABASE_ANON_KEY
);
