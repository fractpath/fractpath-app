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

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) return json(401, { error: "Unauthorized" });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON" });
  }

  const token = typeof body?.token === "string" ? body.token.trim() : "";
  if (!token) return json(422, { error: "token is required" });

  const tokenHash = sha256Hex(token);
  const svc = createServiceClient();

  // Lookup invite by hash (service role; no public access)
  const { data: invite, error: invErr } = await (
    svc.from("thread_invites") as any
  )
    .select(
      "id, thread_id, intended_role, expires_at, used_at, used_by_user_id",
    )
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (invErr) return json(500, { error: invErr.message });
  if (!invite) return json(404, { error: "Invite not found" });

  if (invite.used_at) {
    // Idempotent: if already redeemed by this user, return 200
    if (invite.used_by_user_id === userId) {
      return json(200, {
        ok: true,
        thread_id: invite.thread_id,
        role: "owner",
      });
    }
    return json(409, { error: "Invite already used" });
  }

  const expiresAtMs = Date.parse(invite.expires_at);
  if (!Number.isFinite(expiresAtMs) || Date.now() > expiresAtMs) {
    return json(410, { error: "Invite expired" });
  }

  if (invite.intended_role !== "owner") {
    return json(400, { error: "Invite role invalid" });
  }

  // Load thread principals
  const { data: thread, error: tErr } = await (svc.from("deal_threads") as any)
    .select("id, buyer_user_id, owner_user_id")
    .eq("id", invite.thread_id)
    .maybeSingle();

  if (tErr) return json(500, { error: tErr.message });
  if (!thread) return json(404, { error: "Thread not found" });

  // Buyer cannot redeem their own owner invite
  if (thread.buyer_user_id === userId) {
    return json(403, { error: "Buyer cannot redeem owner invite" });
  }

  // If thread already has an owner:
  if (thread.owner_user_id && thread.owner_user_id !== userId) {
    return json(409, { error: "Thread already has a different owner" });
  }

  // Mark invite used (single use)
  const nowIso = new Date().toISOString();
  const { error: useErr } = await (svc.from("thread_invites") as any)
    .update({ used_at: nowIso, used_by_user_id: userId })
    .eq("id", invite.id);

  if (useErr) return json(500, { error: useErr.message });

  // Attach owner_user_id (idempotent)
  const { error: ownerErr } = await (svc.from("deal_threads") as any)
    .update({ owner_user_id: userId })
    .eq("id", invite.thread_id);

  if (ownerErr) return json(500, { error: ownerErr.message });

  // Ensure owner participant exists (idempotent insert)
  const { data: existingPart, error: partSelErr } = await (
    svc.from("deal_thread_participants") as any
  )
    .select("thread_id")
    .eq("thread_id", invite.thread_id)
    .eq("user_id", userId)
    .eq("role", "owner")
    .maybeSingle();

  if (partSelErr) return json(500, { error: partSelErr.message });

  if (!existingPart) {
    const { error: partInsErr } = await (
      svc.from("deal_thread_participants") as any
    ).insert({
      thread_id: invite.thread_id,
      user_id: userId,
      role: "owner",
      permission: "decide",
      status: "active",
    });

    if (partInsErr) return json(500, { error: partInsErr.message });
  }

  return json(200, { ok: true, thread_id: invite.thread_id, role: "owner" });
}
