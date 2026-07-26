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

  // Load tree image from tempmediaStorage as base64
  const imagePath = "/Users/maddy/.gemini/antigravity/brain/61ff51da-7043-433b-a57a-e1a35652f366/.tempmediaStorage/media_61ff51da-7043-433b-a57a-e1a35652f366_1783704492219.png";
  if (!fs.existsSync(imagePath)) {
    console.error(`Image path does not exist: ${imagePath}`);
    return;
  }
  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString("base64");
  const mimeType = "image/png";

  console.log(`Image loaded! Length: ${base64Image.length} characters.`);

  console.log("2. Invoking detect-issue edge function with real image...");
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
