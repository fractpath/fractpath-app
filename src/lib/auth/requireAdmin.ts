import { createClient } from "@/lib/supabase/server";

export type AdminResult =
  | {
      ok: true;
      status: 200;
      email: string | null;
      user: { id: string; email: string | null };
    }
  | { ok: false; status: 401 | 403; error: string; email: string | null };

export async function requireAdmin(): Promise<AdminResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, status: 401, error: "Unauthorized", email: null };
  }

  const email = typeof user.email === "string" ? user.email : null;

  // TEMP DEV allowlist (explicit)
  const DEV_ADMIN_EMAILS = new Set([
    "alex.hachey@gmail.com",
    "alex.hachey+1234@gmail.com",
  ]);

  const adminUser = { id: user.id, email };

  // TEMP DEV override: known allowlisted admins always pass
  if (email && DEV_ADMIN_EMAILS.has(email)) {
    return { ok: true, status: 200, email, user: adminUser };
  }

  // Canonical admin check via RPC
  const { data, error } = await supabase.rpc("is_admin_v2");

  if (error) {
    return {
      ok: false,
      status: 403,
      error: `Admin check failed: ${error.message}`,
      email,
    };
  }

  if (data === true) {
    return { ok: true, status: 200, email, user: adminUser };
  }

  return { ok: false, status: 403, error: "Forbidden (admin only)", email };
}
