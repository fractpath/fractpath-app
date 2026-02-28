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

  // DB-backed admin check (single source of truth)
  const { data, error } = await supabase.rpc("is_admin_v2");

  if (error) {
    // Fail closed
    return {
      ok: false,
      status: 403,
      error: `Forbidden (admin check failed): ${error.message}`,
    };
  }

  if (data !== true) {
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
