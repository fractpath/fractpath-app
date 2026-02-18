import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

// Load .env.local so this predev script sees what Next will load
const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath, override: false });
}

function must(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return String(v).trim();
}

function isHttpsUrl(v) {
  try {
    const u = new URL(String(v).trim());
    return u.protocol === "https:";
  } catch {
    return false;
  }
}

function looksLikeUrl(v) {
  return /^https?:\/\//i.test(String(v).trim());
}

// Hard requirements (server truth)
const serverUrl = must("SUPABASE_URL");
const serverKey = must("SUPABASE_ANON_KEY");

if (!isHttpsUrl(serverUrl)) {
  throw new Error(`SUPABASE_URL must be https://..., got: ${JSON.stringify(serverUrl)}`);
}
if (looksLikeUrl(serverKey)) {
  throw new Error(`SUPABASE_ANON_KEY must NOT be a URL, got: ${JSON.stringify(serverKey)}`);
}

// Soft checks (public vars may be polluted by platform env)
const pubUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const pubKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

if (pubUrl && !isHttpsUrl(pubUrl)) {
  console.warn(`WARN: NEXT_PUBLIC_SUPABASE_URL looks wrong: ${JSON.stringify(pubUrl)}`);
}
if (pubKey && looksLikeUrl(pubKey)) {
  console.warn(`WARN: NEXT_PUBLIC_SUPABASE_ANON_KEY looks wrong: ${JSON.stringify(pubKey)}`);
}

console.log("env ok");
