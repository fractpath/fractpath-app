import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ threadId: string }> },
) {
  const supabase = await createClient();
  const { threadId } = await ctx.params;

  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr) return json(401, { error: "Unauthorized" });

  const user = auth?.user ?? null;
  const userId = user?.id ?? null;
  const email = user?.email?.toLowerCase() ?? null;

  if (!userId) return json(401, { error: "Unauthorized" });

  const svc = createServiceClient();

  const { data: thread, error: tErr } = await (svc.from("deal_threads") as any)
    .select("id, property_id, buyer_user_id, owner_user_id, status")
    .eq("id", threadId)
    .maybeSingle();

  if (tErr) return json(500, { error: tErr.message });
  if (!thread) return json(404, { error: "Thread not found" });

  if (!thread.property_id) {
    return json(400, { error: "Thread has no property" });
  }

  if (thread.buyer_user_id === userId) {
    return json(403, { error: "Buyer cannot claim property" });
  }

  const isOwnerUserId = thread.owner_user_id === userId;

  let isOwnerParticipant = false;
  if (!isOwnerUserId) {
    const { data: participant, error: pErr } = await (
      svc.from("deal_thread_participants") as any
    )
      .select("thread_id,user_id,role,status")
      .eq("thread_id", threadId)
      .eq("user_id", userId)
      .eq("role", "owner")
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    if (pErr) return json(500, { error: pErr.message });
    isOwnerParticipant = !!participant;
  }

  let isInvitedOwner = false;
  if (!isOwnerUserId && !isOwnerParticipant && email) {
    const { data: invite, error: inviteErr } = await (
      svc.from("thread_invites") as any
    )
      .select("id,intended_role,expires_at")
      .eq("thread_id", threadId)
      .eq("invitee_email", email)
      .eq("intended_role", "owner")
      .is("declined_at", null)
      .limit(1)
      .maybeSingle();

    if (inviteErr) return json(500, { error: inviteErr.message });

    if (invite) {
      const notExpired =
        !invite.expires_at || new Date(invite.expires_at) > new Date();
      isInvitedOwner = notExpired;
    }
  }

  if (!isOwnerUserId && !isOwnerParticipant && !isInvitedOwner) {
    return json(403, { error: "Forbidden" });
  }

  const propertyId = thread.property_id as string;

  // Re-read property immediately before claim to avoid stale state.
  const { data: prop, error: pLoadErr } = await (svc.from("properties") as any)
    .select("*")
    .eq("id", propertyId)
    .maybeSingle();

  if (pLoadErr) return json(500, { error: pLoadErr.message });
  if (!prop) return json(404, { error: "Property not found" });

  const ownershipStatus =
    "ownership_status" in prop ? (prop.ownership_status ?? null) : null;

  const currentOwnerUserId =
    "owner_user_id" in prop ? (prop.owner_user_id ?? null) : null;

  const currentClaimedByUserId =
    "claimed_by_user_id" in prop ? (prop.claimed_by_user_id ?? null) : null;

  const explicitlyUnclaimed =
    !ownershipStatus || ownershipStatus === "unclaimed";

  const alreadyClaimedByThisUser =
    currentClaimedByUserId === userId || currentOwnerUserId === userId;

  const alreadyClaimedByAnotherUser =
    ownershipStatus === "claimed" &&
    !!(currentClaimedByUserId || currentOwnerUserId) &&
    !alreadyClaimedByThisUser;

  if (alreadyClaimedByAnotherUser) {
    return json(409, {
      ok: false,
      error: "Property has already been claimed by another user",
    });
  }

  const patch: Record<string, any> = {};

  if ("claimed_by_user_id" in prop) patch.claimed_by_user_id = userId;
  if ("owner_user_id" in prop) patch.owner_user_id = userId;
  else if ("user_id" in prop) patch.user_id = userId;

  if ("ownership_status" in prop) patch.ownership_status = "claimed";

  // Reset claim_released_at so a previously released property doesn't carry a
  // stale release timestamp after being re-claimed by a new owner.
  if ("claim_released_at" in prop) patch.claim_released_at = null;

  if (!("claimed_by_user_id" in patch) && !("owner_user_id" in patch) && !("user_id" in patch)) {
    return json(500, {
      ok: false,
      error:
        "properties table missing claimable ownership columns; cannot claim without schema support",
    });
  }

  // Use a plain eq("id") update — we confirmed the property is unclaimed in the
  // pre-check above (explicitlyUnclaimed). Chaining .or() on an update query
  // can produce an unhandled JS exception in some Supabase client versions,
  // which Next.js converts to a 502. The re-read below handles any race.
  let claimedRows: any[] | null = null;
  let pUpdErr: any = null;
  try {
    const result = await (svc.from("properties") as any)
      .update(patch)
      .eq("id", propertyId)
      .select("*");
    claimedRows = result.data;
    pUpdErr = result.error;
  } catch (e: any) {
    return json(500, { ok: false, error: String(e?.message ?? e) });
  }

  if (pUpdErr) return json(500, { ok: false, error: pUpdErr.message });

  const claimedProp = Array.isArray(claimedRows) ? claimedRows[0] : claimedRows;

  if (!claimedProp) {
    const { data: freshProp, error: freshErr } = await (
      svc.from("properties") as any
    )
      .select("*")
      .eq("id", propertyId)
      .maybeSingle();

    if (freshErr) return json(500, { ok: false, error: freshErr.message });

    const freshOwnershipStatus =
      freshProp && "ownership_status" in freshProp
        ? (freshProp.ownership_status ?? null)
        : null;

    const freshOwnerUserId =
      freshProp && "owner_user_id" in freshProp
        ? (freshProp.owner_user_id ?? null)
        : null;

    const freshClaimedByUserId =
      freshProp && "claimed_by_user_id" in freshProp
        ? (freshProp.claimed_by_user_id ?? null)
        : null;

    const freshClaimedByThisUser =
      freshOwnerUserId === userId || freshClaimedByUserId === userId;

    const freshClaimedByAnotherUser =
      freshOwnershipStatus === "claimed" &&
      !!(freshOwnerUserId || freshClaimedByUserId) &&
      !freshClaimedByThisUser;

    if (freshClaimedByThisUser) {
      return json(200, {
        ok: true,
        thread_id: threadId,
        property_id: propertyId,
        owner_user_id: freshOwnerUserId ?? userId,
        claimed_by_user_id: freshClaimedByUserId ?? userId,
        ownership_status: freshOwnershipStatus ?? "claimed",
      });
    }

    if (freshClaimedByAnotherUser) {
      return json(409, {
        ok: false,
        error: "Property has already been claimed by another user",
      });
    }

    return json(409, {
      ok: false,
      error: "Property claim did not persist",
    });
  }

  await (svc.from("deal_threads") as any)
    .update({ owner_user_id: userId })
    .eq("id", threadId)
    .is("owner_user_id", null);

  return json(200, {
    ok: true,
    thread_id: threadId,
    property_id: propertyId,
    owner_user_id:
      ("owner_user_id" in claimedProp ? claimedProp.owner_user_id : null) ??
      userId,
    claimed_by_user_id:
      ("claimed_by_user_id" in claimedProp
        ? claimedProp.claimed_by_user_id
        : null) ?? userId,
    ownership_status:
      ("ownership_status" in claimedProp
        ? claimedProp.ownership_status
        : null) ?? null,
  });
}
