import { createClient } from "@/lib/supabase/server";

type AdminUser = {
  id: string;
  email: string | undefined;
  user_metadata: Record<string, unknown>;
};

type AdminResult =
  | { ok: true; user: AdminUser }
  | { ok: false; status: 401 | 403; error: string };

export async function requireAdmin(): Promise<AdminResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  // DEV gate: allow known test admin emails when RPC is unavailable
  const DEV_ADMIN_EMAILS = new Set([
    "alex.hachey@gmail.com",
    "alex.hachey+1234@gmail.com",
  ]);

  // DB-backed admin check (single source of truth)
  const { data, error } = await supabase.rpc("is_admin_v2");

  if (error) {
    // RPC failed (e.g. function/column missing) — fall back to dev gate
    if (user.email && DEV_ADMIN_EMAILS.has(user.email)) {
      // Temporary dev fallback — remove when is_admin_v2 RPC is stable
    } else {
      return {
        ok: false,
        status: 403,
        error: `Forbidden (admin check failed): ${error.message}`,
      };
    }
  } else if (data !== true) {
    // RPC succeeded and user is not admin — no fallback, hard deny
    return { ok: false, status: 403, error: "Forbidden (admin only)" };
  }

  return {
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      user_metadata: (user.user_metadata ?? {}) as Record<string, unknown>,
    },
  };
}
