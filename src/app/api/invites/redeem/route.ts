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

  if (invite.intended_role !== "owner" && invite.intended_role !== "buyer") {
    return json(400, { error: "Invite role invalid" });
  }

  const role: "owner" | "buyer" = invite.intended_role;

  if (invite.used_at) {
    // Idempotent: if already redeemed by this same user, return 200 with context
    if (invite.used_by_user_id === userId) {
      // Fetch deal_id for the redirect
      const { data: threadRow } = await (svc.from("deal_threads") as any)
        .select("deal_id")
        .eq("id", invite.thread_id)
        .maybeSingle();
      return json(200, {
        ok: true,
        thread_id: invite.thread_id,
        deal_id: threadRow?.deal_id ?? null,
        role,
      });
    }
    return json(409, { error: "Invite already used" });
  }

  const expiresAtMs = Date.parse(invite.expires_at);
  if (!Number.isFinite(expiresAtMs) || Date.now() > expiresAtMs) {
    return json(410, { error: "Invite expired" });
  }

  // Load thread principals + deal_id for redirect
  const { data: thread, error: tErr } = await (svc.from("deal_threads") as any)
    .select("id, buyer_user_id, owner_user_id, deal_id")
    .eq("id", invite.thread_id)
    .maybeSingle();

  if (tErr) return json(500, { error: tErr.message });
  if (!thread) return json(404, { error: "Thread not found" });

  const dealId: string | null = thread.deal_id ?? null;

  // ── Owner invite path ──────────────────────────────────────────────────────
  if (role === "owner") {
    // Buyer cannot redeem an owner invite
    if (thread.buyer_user_id === userId) {
      return json(403, { error: "Buyer cannot redeem owner invite" });
    }

    // If thread already has a different owner, reject
    if (thread.owner_user_id && thread.owner_user_id !== userId) {
      return json(409, { error: "Thread already has a different owner" });
    }

    // Mark invite used (single use)
    const nowIso = new Date().toISOString();
    const { error: useErr } = await (svc.from("thread_invites") as any)
      .update({ used_at: nowIso, used_by_user_id: userId })
      .eq("id", invite.id);

    if (useErr) return json(500, { error: useErr.message });

    // Stamp owner_user_id on thread (idempotent)
    const { error: ownerErr } = await (svc.from("deal_threads") as any)
      .update({ owner_user_id: userId })
      .eq("id", invite.thread_id);

    if (ownerErr) return json(500, { error: ownerErr.message });

    // Ensure owner participant record exists
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

    return json(200, { ok: true, thread_id: invite.thread_id, deal_id: dealId, role: "owner" });
  }

  // ── Buyer invite path (owner→buyer flow) ──────────────────────────────────
  // The thread owner cannot redeem a buyer invite on the same thread
  if (thread.owner_user_id === userId) {
    return json(403, { error: "Thread owner cannot redeem buyer invite" });
  }

  // Idempotent: if thread already linked to a different buyer, reject
  if (thread.buyer_user_id && thread.buyer_user_id !== userId) {
    return json(409, { error: "Thread already has a different buyer" });
  }

  // Mark invite used (single use)
  const nowIso = new Date().toISOString();
  const { error: useErr } = await (svc.from("thread_invites") as any)
    .update({ used_at: nowIso, used_by_user_id: userId })
    .eq("id", invite.id);

  if (useErr) return json(500, { error: useErr.message });

  // Stamp buyer_user_id on thread (idempotent — may already be set from a
  // previous redeem attempt if idempotent case was reached above)
  if (!thread.buyer_user_id) {
    const { error: buyerErr } = await (svc.from("deal_threads") as any)
      .update({ buyer_user_id: userId })
      .eq("id", invite.thread_id);

    if (buyerErr) return json(500, { error: buyerErr.message });
  }

  // Ensure buyer participant record exists
  const { data: existingBuyerPart, error: buyerPartSelErr } = await (
    svc.from("deal_thread_participants") as any
  )
    .select("thread_id")
    .eq("thread_id", invite.thread_id)
    .eq("user_id", userId)
    .eq("role", "buyer")
    .maybeSingle();

  if (buyerPartSelErr) return json(500, { error: buyerPartSelErr.message });

  if (!existingBuyerPart) {
    const { error: buyerPartInsErr } = await (
      svc.from("deal_thread_participants") as any
    ).insert({
      thread_id: invite.thread_id,
      user_id: userId,
      role: "buyer",
      permission: "decide",
      status: "active",
    });

    if (buyerPartInsErr) return json(500, { error: buyerPartInsErr.message });
  }

  // Ensure the buyer has a deal access grant (VIEWER) so RLS lets them read
  if (dealId) {
    await (svc.from("deal_access_grants") as any).upsert(
      {
        deal_id: dealId,
        user_id: userId,
        role: "VIEWER",
        created_by: thread.owner_user_id ?? userId,
        revoked_at: null,
        expires_at: null,
      },
      { onConflict: "deal_id,user_id" },
    );
  }

  return json(200, { ok: true, thread_id: invite.thread_id, deal_id: dealId, role: "buyer" });
}
