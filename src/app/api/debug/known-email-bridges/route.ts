import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return json(401, { ok: false, error: "Unauthorized" });

  const svc = createServiceClient();
  const email = user.email?.toLowerCase() ?? null;

  const { data: ownedProperties, error: ownedErr } = await (svc.from("properties") as any)
    .select(
      "id,address_line1,city,state,postal_code,status,ownership_status,owner_user_id,claimed_by_user_id,created_by_user_id,created_at,updated_at",
    )
    .or(
      `owner_user_id.eq.${user.id},created_by_user_id.eq.${user.id},claimed_by_user_id.eq.${user.id}`,
    )
    .order("updated_at", { ascending: false });

  if (ownedErr) return json(500, { ok: false, where: "ownedProperties", error: ownedErr.message });

  const { data: invites, error: invitesErr } = await (svc.from("thread_invites") as any)
    .select("id,thread_id,invitee_email,intended_role,expires_at,created_at")
    .eq("invitee_email", email)
    .eq("intended_role", "owner");

  if (invitesErr) return json(500, { ok: false, where: "thread_invites", error: invitesErr.message });

  const { data: participants, error: participantsErr } = await (
    svc.from("deal_thread_participants") as any
  )
    .select("thread_id,user_id,role,status,created_at")
    .eq("user_id", user.id)
    .eq("role", "owner");

  if (participantsErr) {
    return json(500, { ok: false, where: "deal_thread_participants", error: participantsErr.message });
  }

  const { data: grants, error: grantsErr } = await (svc.from("deal_access_grants") as any)
    .select("deal_id,user_id,role,revoked_at,created_at")
    .eq("user_id", user.id)
    .is("revoked_at", null);

  if (grantsErr) return json(500, { ok: false, where: "deal_access_grants", error: grantsErr.message });

  const inviteThreadIds = (invites ?? [])
    .filter((x: any) => !x.expires_at || new Date(x.expires_at) > new Date())
    .map((x: any) => x.thread_id)
    .filter(Boolean);

  const participantThreadIds = (participants ?? [])
    .filter((x: any) => x.status === "active")
    .map((x: any) => x.thread_id)
    .filter(Boolean);

  const grantedDealIds = (grants ?? [])
    .map((x: any) => x.deal_id)
    .filter(Boolean);

  const { data: ownerThreads, error: ownerThreadsErr } = await (svc.from("deal_threads") as any)
    .select("id,deal_id,property_id,status,owner_user_id,buyer_user_id,created_at")
    .eq("owner_user_id", user.id);

  if (ownerThreadsErr) return json(500, { ok: false, where: "ownerThreads", error: ownerThreadsErr.message });

  let grantThreads: any[] = [];
  if (grantedDealIds.length > 0) {
    const { data, error } = await (svc.from("deal_threads") as any)
      .select("id,deal_id,property_id,status,owner_user_id,buyer_user_id,created_at")
      .in("deal_id", grantedDealIds);

    if (error) return json(500, { ok: false, where: "grantThreads", error: error.message });
    grantThreads = data ?? [];
  }

  const bridgeThreadIds = Array.from(
    new Set([
      ...inviteThreadIds,
      ...participantThreadIds,
      ...(ownerThreads ?? []).map((x: any) => x.id).filter(Boolean),
      ...grantThreads.map((x: any) => x.id).filter(Boolean),
    ]),
  );

  let bridgeThreads: any[] = [];
  if (bridgeThreadIds.length > 0) {
    const { data, error } = await (svc.from("deal_threads") as any)
      .select("id,deal_id,property_id,status,owner_user_id,buyer_user_id,created_at")
      .in("id", bridgeThreadIds);

    if (error) return json(500, { ok: false, where: "bridgeThreads", error: error.message });
    bridgeThreads = data ?? [];
  }

  const bridgePropertyIds = bridgeThreads.map((x: any) => x.property_id).filter(Boolean);

  let bridgeProperties: any[] = [];
  if (bridgePropertyIds.length > 0) {
    const { data, error } = await (svc.from("properties") as any)
      .select(
        "id,address_line1,address_line2,city,state,postal_code,status,ownership_status,owner_user_id,claimed_by_user_id,created_by_user_id,created_at,updated_at",
      )
      .in("id", bridgePropertyIds);

    if (error) return json(500, { ok: false, where: "bridgeProperties", error: error.message });
    bridgeProperties = data ?? [];
  }

  return json(200, {
    ok: true,
    user: {
      id: user.id,
      email,
    },
    counts: {
      ownedProperties: ownedProperties?.length ?? 0,
      invites: invites?.length ?? 0,
      participants: participants?.length ?? 0,
      grants: grants?.length ?? 0,
      ownerThreads: ownerThreads?.length ?? 0,
      grantThreads: grantThreads?.length ?? 0,
      bridgeThreads: bridgeThreads?.length ?? 0,
      bridgeProperties: bridgeProperties?.length ?? 0,
    },
    ownedProperties: ownedProperties ?? [],
    invites: invites ?? [],
    participants: participants ?? [],
    grants: grants ?? [],
    ownerThreads: ownerThreads ?? [],
    grantThreads,
    bridgeThreads,
    bridgeProperties,
  });
}