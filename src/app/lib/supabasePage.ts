import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function mustGetEnv(name: string) {
  const v = process.env[name];
  if (!v || String(v).trim() === "") throw new Error(`Missing env var: ${name}`);
  return String(v).trim();
}

function isEmailConfirmed(user: any): boolean {
  // Supabase user fields vary by version/config:
  // - email_confirmed_at (common)
  // - confirmed_at (sometimes used)
  const a = user?.email_confirmed_at;
  const b = user?.confirmed_at;
  return Boolean((typeof a === "string" && a) || (typeof b === "string" && b));
}

export async function createSupabasePageClient() {
  const cookieStore = await cookies();

  const supabaseUrl = mustGetEnv("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseAnonKey = mustGetEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
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

  return { supabase, cookieStore };
}

export async function getUserOrNull() {
  const { supabase } = await createSupabasePageClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return null;
  return data.user;
}

export async function requireUser() {
  const { supabase } = await createSupabasePageClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data?.user) {
    redirect("/login");
  }

  if (!isEmailConfirmed(data.user)) {
    // Pass email so the verify page can prefill resend.
    const email = encodeURIComponent(data.user.email || "");
    redirect(`/verify-email?email=${email}`);
  }

  return { supabase, user: data.user };
}
