import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

function pickEnv(...names: string[]) {
  for (const name of names) {
    const v = process.env[name];
    if (v && String(v).trim() !== "") return String(v).trim();
  }
  throw new Error(`Missing Supabase env vars. Tried: ${names.join(", ")}`);
}

function assertValidHttpsUrl(raw: string, label: string) {
  const v = String(raw).trim();
  try {
    const u = new URL(v);
    if (u.protocol !== "https:") throw new Error("protocol must be https");
    return v;
  } catch (e: any) {
    throw new Error(
      `${label} is invalid. value=${JSON.stringify(v)} error=${e?.message ?? String(e)}`,
    );
  }
}

export async function supabaseServer() {
  console.log("[ENV CHECK]", {
    SUPABASE_URL: process.env.SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY?.slice(0, 12),
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.slice(0, 12),
  });

  if (
    process.env.SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_URL !== process.env.NEXT_PUBLIC_SUPABASE_URL
  ) {
    throw new Error(
      "ENV MISMATCH: SUPABASE_URL and NEXT_PUBLIC_SUPABASE_URL differ",
    );
  }

  if (
    process.env.SUPABASE_ANON_KEY &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_ANON_KEY !== process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    throw new Error(
      "ENV MISMATCH: SUPABASE_ANON_KEY and NEXT_PUBLIC_SUPABASE_ANON_KEY differ",
    );
  }

  const cookieStore = await cookies();

  const supabaseUrlRaw = pickEnv("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
  const supabaseAnonKey = pickEnv(
    "SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  );

  const supabaseUrl = assertValidHttpsUrl(
    supabaseUrlRaw,
    "SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL",
  );

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: any) {
        cookieStore.set({ name, value, ...options });
      },
      remove(name: string, options: any) {
        cookieStore.set({ name, value: "", ...options, maxAge: 0 });
      },
    },
  });
}
