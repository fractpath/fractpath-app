import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ dealId: string }> },
) {
  const supabase = await createClient();
  const { dealId } = await ctx.params;

  if (!UUID_RE.test(dealId)) {
    return json(400, { error: "Invalid dealId" });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return json(401, { error: "Unauthorized" });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON" });
  }

  const mode = body?.mode;
  if (!["verified_owner", "known_email", "outreach"].includes(mode)) {
    return json(422, {
      error: "mode must be verified_owner, known_email, or outreach",
    });
  }

  const svc = createServiceClient();

  const { data: deal, error: dealErr } = await supabase
    .from("deals")
    .select("id, owner_user_id")
    .eq("id", dealId)
    .maybeSingle();

  if (dealErr || !deal) return json(404, { error: "Deal not found" });

  const { data: grant } = await supabase
    .from("deal_access_grants")
    .select("role")
    .eq("deal_id", dealId)
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .maybeSingle();

  const isOwner =
    (deal as any).owner_user_id === user.id || grant?.role === "OWNER";

  if (!isOwner) {
    return json(403, { error: "Only the deal owner can submit an offer" });
  }

  const { data: existingThreads } = await (svc.from("deal_threads") as any)
    .select("id, status")
    .eq("deal_id", dealId)
    .in("status", ["pending_owner"]);

  if (existingThreads && existingThreads.length > 0) {
    return json(409, { error: "An active offer already exists for this deal" });
  }

  const propertyId =
    typeof body?.property_id === "string" ? body.property_id.trim() : "";
  if (!UUID_RE.test(propertyId)) {
    return json(422, { error: "property_id must be a valid UUID" });
  }

  let ownerUserId: string | null = null;

  if (mode === "verified_owner") {
    const { data: prop } = await (svc.from("properties") as any)
      .select("id, owner_user_id, status")
      .eq("id", propertyId)
      .maybeSingle();

    if (!prop || prop.status !== "verified" || !prop.owner_user_id) {
      return json(422, {
        error: "Property must be verified with a known owner",
      });
    }
    ownerUserId = prop.owner_user_id;
  }

  const { data: thread, error: threadErr } = await (
    svc.from("deal_threads") as any
  )
    .insert({
      deal_id: dealId,
      property_id: propertyId,
      created_by_user_id: user.id,
      buyer_user_id: user.id,
      owner_user_id: ownerUserId ?? null,
      status: "pending_owner",
    })
    .select()
    .single();

  if (threadErr) {
    console.error("submit_offer_thread_error", threadErr);
    return json(500, { error: threadErr.message });
  }

  const { error: partErr } = await (
    svc.from("deal_thread_participants") as any
  ).insert({
    thread_id: thread.id,
    user_id: user.id,
    role: "buyer",
    permission: "propose",
    status: "active",
  });

  if (partErr) {
    console.error("submit_offer_participant_error", partErr);
    await (svc.from("deal_threads") as any).delete().eq("id", thread.id);
    return json(500, { error: partErr.message });
  }

  const { data: proposal, error: propErr } = await (
    svc.from("deal_proposals") as any
  )
    .insert({
      thread_id: thread.id,
      created_by_user_id: user.id,
      status: "submitted",
      terms_snapshot: body?.terms_snapshot ?? {},
    })
    .select("id")
    .single();

  if (propErr) {
    console.error("submit_offer_proposal_error", propErr);
    await (svc.from("deal_thread_participants") as any)
      .delete()
      .eq("thread_id", thread.id);
    await (svc.from("deal_threads") as any).delete().eq("id", thread.id);
    return json(500, { error: propErr.message });
  }

  await (svc.from("deal_threads") as any)
    .update({ current_proposal_id: proposal.id })
    .eq("id", thread.id);

  if (mode === "known_email") {
    const email =
      typeof body?.invitee_email === "string"
        ? body.invitee_email.trim().toLowerCase()
        : "";
    if (email && email.includes("@")) {
      const crypto = await import("crypto");
      const token = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

      await (svc.from("thread_invites") as any).insert({
        thread_id: thread.id,
        intended_role: "owner",
        invitee_email: email,
        token_hash: tokenHash,
        expires_at: new Date(
          Date.now() + 7 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        created_by_user_id: user.id,
      });
    }
  }

  if (mode === "outreach") {
    const crypto = await import("crypto");
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    await (svc.from("thread_invites") as any).insert({
      thread_id: thread.id,
      intended_role: "owner",
      invitee_email: "outreach@fractpath.internal",
      token_hash: tokenHash,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      created_by_user_id: user.id,
    });
  }
  // Option A (Sprint 13): deterministically set deals.owner_user_id from the thread's property owner.
  // This keeps legacy owner-based deal access consistent for verified owners.
  const { data: propRow, error: propOwnerErr } = await (
    svc.from("properties") as any
  )
    .select("owner_user_id")
    .eq("id", thread.property_id)
    .single();

  if (propOwnerErr) {
    console.error("submit_offer_load_property_owner_error", propOwnerErr);
    return json(500, { error: propOwnerErr.message });
  }

  const { error: dealOwnerUpdErr } = await (svc.from("deals") as any)
    .update({ owner_user_id: propRow.owner_user_id })
    .eq("id", dealId)
    .eq("status", "DRAFT"); // guard: don't mutate after acceptance/execution

  if (dealOwnerUpdErr) {
    console.error("submit_offer_set_deal_owner_error", dealOwnerUpdErr);
    return json(500, { error: dealOwnerUpdErr.message });
  }

  if (propRow.owner_user_id) {
    const { error: ownerGrantErr } = await (
      svc.from("deal_access_grants") as any
    ).upsert(
      {
        deal_id: dealId,
        user_id: propRow.owner_user_id,
        role: "OWNER",
        created_by: user.id,
        revoked_at: null,
        expires_at: null,
      },
      { onConflict: "deal_id,user_id" },
    );

    if (ownerGrantErr) {
      console.error("submit_offer_mint_owner_grant_error", ownerGrantErr);
      return json(500, { error: ownerGrantErr.message });
    }
  }

  // IMPORTANT: move the deal out of DRAFT into the review state expected by the DB transition guard.
  // This prevents invalid transition DRAFT -> ACTIVE on owner accept.
  // Sprint 13: do NOT update deals.status here.
  // The DB transition guard does not allow DRAFT -> UNDER_REVIEW (or DRAFT -> ACTIVE).
  // Deal lifecycle alignment will be handled in a future sprint.

  await (svc.from("deal_events") as any).insert({
    deal_id: dealId,
    event_type: "offer_submitted",
    payload: { thread_id: thread.id, proposal_id: proposal.id, mode },
    created_by: user.id,
  });

  return json(200, {
    ok: true,
    thread_id: thread.id,
    proposal_id: proposal.id,
    mode,
  });
}
