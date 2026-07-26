import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

// Read .env variables
const envPath = path.resolve(process.cwd(), ".env");
const envContent = fs.readFileSync(envPath, "utf8");
const env = {};
envContent.split("\n").forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] || "";
    if (value.startsWith("\"") && value.endsWith("\"")) {
      value = value.substring(1, value.length - 1);
    }
    env[match[1]] = value;
  }
});

const supabaseUrl = env.VITE_SUPABASE_URL || "https://vttrmmrirdnijhklgllx.supabase.co";
const supabaseAnonKey = env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_UmDMyVHWHfa6dFupecKPEg_g0_xJban";

console.log("Supabase URL:", supabaseUrl);

async function runTest() {
  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  console.log("1. Authenticating...");
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: "water@samadhan.gov.in",
    password: "Samadhan@Water2024!",
  });

  if (authErr) {
    console.error("Auth failed:", authErr.message);
    return;
  }

  const token = authData.session.access_token;
  console.log("Auth success! Token acquired.");

  // Use a tiny 1x1 transparent spacer GIF in base64
  const base64Image = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  const mimeType = "image/gif";

  console.log("2. Invoking detect-issue edge function...");
  const start = Date.now();
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/detect-issue`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        image: base64Image,
        mime_type: mimeType
      })
    });

    console.log("Response HTTP Status:", response.status);
    const text = await response.text();
    console.log(`Completed in ${Date.now() - start}ms`);
    console.log("Raw Response Body:\n", text);
  } catch (err) {
    console.error("Invocation failed:", err);
  }
}

runTest();
