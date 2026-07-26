import * as fs from "fs";
import * as path from "path";

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

const geminiKey = env.GEMINI_API_KEY;

async function testModel(modelName, bodyExtra = {}) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiKey}`;
  const start = Date.now();
  console.log(`\nTesting ${modelName}...`);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "Identify the civic issue in this image." }] }],
        ...bodyExtra
      })
    });
    console.log(`${modelName} Status:`, res.status);
    const json = await res.json();
    console.log(`${modelName} Completed in ${Date.now() - start}ms`);
    if (res.status !== 200) {
      console.log(`${modelName} Error:`, JSON.stringify(json.error || json, null, 2));
    } else {
      console.log(`${modelName} Text Output:`, json.candidates?.[0]?.content?.parts?.[0]?.text?.substring(0, 100));
    }
  } catch (err) {
    console.log(`${modelName} Exception:`, err.message);
  }
}

async function run() {
  // Test gemini-2.5-flash with thinking budget = 0
  await testModel("gemini-2.5-flash", {
    generationConfig: {
      thinkingConfig: {
        thinkingBudget: 0
      }
    }
  });

  // Test gemini-flash-latest (1.5-flash)
  await testModel("gemini-flash-latest");

  // Test gemini-1.5-flash
  await testModel("gemini-1.5-flash");
}

run();
