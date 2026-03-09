import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

type Params = { threadId: string };

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function GET(_req: Request, ctx: { params: Promise<Params> }) {
  const { threadId } = await ctx.params;

  const supabase = await createClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr) return jsonError(userErr.message, 401);
  if (!user) return jsonError("Unauthorized", 401);

  const svc = createServiceClient();

  const { data: thread, error: threadErr } = await (
    svc.from("deal_threads") as any
  )
    .select("id, property_id, buyer_user_id, owner_user_id, created_by_user_id")
    .eq("id", threadId)
    .maybeSingle();

  if (threadErr) return jsonError(threadErr.message, 500);
  if (!thread) return jsonError("Thread not found", 404);

  const email = user.email?.toLowerCase() ?? null;

  const isBuyer = thread.buyer_user_id === user.id;
  const isThreadOwner = thread.owner_user_id === user.id;
  const isCreator = thread.created_by_user_id === user.id;

  let isPropertyOwner = false;
  if (thread.property_id) {
    const { data: propOwnerRow, error: propOwnerErr } = await (
      svc.from("properties") as any
    )
      .select("owner_user_id")
      .eq("id", thread.property_id)
      .maybeSingle();

    if (propOwnerErr) return jsonError(propOwnerErr.message, 500);

    isPropertyOwner =
      !!propOwnerRow?.owner_user_id && propOwnerRow.owner_user_id === user.id;
  }

  let isOwnerParticipant = false;
  const { data: participant, error: participantErr } = await (
    svc.from("deal_thread_participants") as any
  )
    .select("thread_id,user_id,role,status")
    .eq("thread_id", threadId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (participantErr) return jsonError(participantErr.message, 500);
  isOwnerParticipant = !!participant;

  let isInvitedOwner = false;
  if (email) {
    const { data: invite, error: inviteErr } = await (
      svc.from("thread_invites") as any
    )
      .select("id,intended_role,expires_at")
      .eq("thread_id", threadId)
      .eq("invitee_email", email)
      .eq("intended_role", "owner")
      .limit(1)
      .maybeSingle();

    if (inviteErr) return jsonError(inviteErr.message, 500);

    if (invite) {
      const notExpired =
        !invite.expires_at || new Date(invite.expires_at) > new Date();
      isInvitedOwner = notExpired;
    }
  }

  const canView =
    isBuyer ||
    isThreadOwner ||
    isCreator ||
    isPropertyOwner ||
    isOwnerParticipant ||
    isInvitedOwner;

  if (!canView) {
    return jsonError("Forbidden", 403);
  }

  const propertyId = (thread as any).property_id as string | null;
  if (!propertyId) {
    return NextResponse.json({
      ok: true,
      property_id: null,
      property_status: null,
      ownership_status: null,
      owner_user_id: null,
      claimed_by_user_id: null,
      can_claim: false,
      can_verify: false,
      accept_allowed: false,
      state: "missing_property",
      verify_url: null,
    });
  }

  const { data: prop, error: propErr } = await (svc.from("properties") as any)
    .select("id, status, ownership_status, owner_user_id, claimed_by_user_id")
    .eq("id", propertyId)
    .maybeSingle();

  if (propErr) return jsonError(propErr.message, 500);
  if (!prop) return jsonError("Property not found", 404);

  const property_status = (prop.status as string | null) ?? null;
  const ownership_status = (prop.ownership_status as string | null) ?? null;
  const owner_user_id = (prop.owner_user_id as string | null) ?? null;
  const claimed_by_user_id = (prop.claimed_by_user_id as string | null) ?? null;

  const effectiveClaimant = claimed_by_user_id ?? owner_user_id ?? null;
  const isClaimant = effectiveClaimant === user.id;
  const alreadyClaimedByAnother =
    !!effectiveClaimant && effectiveClaimant !== user.id;

  if (alreadyClaimedByAnother) {
    return NextResponse.json({
      ok: true,
      property_id: propertyId,
      property_status,
      ownership_status,
      owner_user_id,
      claimed_by_user_id,
      can_claim: false,
      can_verify: false,
      accept_allowed: false,
      state: "claimed_by_other",
      verify_url: null,
    });
  }

  const canClaim =
    isInvitedOwner &&
    !effectiveClaimant &&
    (!ownership_status || ownership_status === "unclaimed");

  const canVerify = isClaimant;
  const accept_allowed = property_status === "verified" && isClaimant;
  const verify_url = isClaimant ? "/me" : null;

  return NextResponse.json({
    ok: true,
    property_id: propertyId,
    property_status,
    ownership_status,
    owner_user_id,
    claimed_by_user_id,
    can_claim: canClaim,
    can_verify: canVerify,
    accept_allowed,
    state: isClaimant ? "claimed_by_me" : canClaim ? "claimable" : "waiting",
    verify_url,
  });
}
