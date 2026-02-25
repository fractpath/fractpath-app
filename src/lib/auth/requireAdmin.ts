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

  const role = user.user_metadata?.role;
  if (role !== "admin") {
    return { ok: false, status: 403, error: "Forbidden (admin only)" };
  }

  return {
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      user_metadata: user.user_metadata ?? {},
    },
  };
}
