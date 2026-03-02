import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import crypto from "crypto";

export const runtime = "nodejs";

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

function sha256Hex(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ threadId: string }> },
) {
  const supabase = await createClient();
  const { threadId } = await ctx.params;

  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) return json(401, { error: "Unauthorized" });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // optional body; ignore JSON errors
  }

  const inviteeEmail =
    typeof body?.invitee_email === "string" && body.invitee_email.trim()
      ? body.invitee_email.trim()
      : null;

  const svc = createServiceClient();

  // Buyer-only guard
  const { data: thread, error: tErr } = await (svc.from("deal_threads") as any)
    .select("id, buyer_user_id")
    .eq("id", threadId)
    .maybeSingle();

  if (tErr) return json(500, { error: tErr.message });
  if (!thread) return json(404, { error: "Thread not found" });
  if (thread.buyer_user_id !== userId) return json(403, { error: "Forbidden" });

  // Generate token (never stored), store hash only
  const token = crypto.randomBytes(32).toString("hex"); // 64 hex chars
  const tokenHash = sha256Hex(token);
  const expiresAt = new Date(
    Date.now() + 7 * 24 * 60 * 60 * 1000,
  ).toISOString(); // 7 days

  const { error: insErr } = await (svc.from("thread_invites") as any).insert({
    thread_id: threadId,
    intended_role: "owner",
    invitee_email: inviteeEmail,
    token_hash: tokenHash,
    expires_at: expiresAt,
    created_by_user_id: userId,
  });

  if (insErr) return json(500, { error: insErr.message });

  // No UI page required in this phase; return a conventional claim URL for later wiring.
  const inviteUrl = `/invites/claim?token=${encodeURIComponent(token)}`;

  return json(200, {
    ok: true,
    thread_id: threadId,
    intended_role: "owner",
    expires_at: expiresAt,
    invitee_email: inviteeEmail,
    invite_token: token,
    invite_url: inviteUrl,
  });
}
