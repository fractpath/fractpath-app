import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getAppBaseUrlServer } from "@/lib/appBaseUrl";
import { sendTemplateEmail } from "@/lib/email/sendTemplateEmail";
import { computeDealAdapter as computeDeal } from "@/lib/computeAdapter";
import { ensureScenario } from "@/lib/defaultScenario";
import { CONTRACT_VERSION, SCHEMA_VERSION } from "@/lib/contractVersion";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed && trimmed.includes("@") ? trimmed : null;
}

function resolvePropertyAddress(
  canonicalHeader: Record<string, unknown> | undefined,
): string {
  const displayAddress =
    typeof canonicalHeader?.display_address === "string"
      ? canonicalHeader.display_address.trim()
      : "";

  return displayAddress || "this property";
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
    .in("status", ["pending_owner", "negotiating"]);

  if (existingThreads && existingThreads.length > 0) {
    return json(409, { error: "An active offer already exists for this deal" });
  }

  const propertyId =
    typeof body?.property_id === "string" ? body.property_id.trim() : "";
  if (!UUID_RE.test(propertyId)) {
    return json(422, { error: "property_id must be a valid UUID" });
  }

  const { data: prop } = await (svc.from("properties") as any)
    .select("id, owner_user_id, status")
    .eq("id", propertyId)
    .maybeSingle();

  if (!prop) {
    return json(422, {
      error:
        "Property not found. It may have been removed. Please re-select the property and try again.",
    });
  }

  let ownerUserId: string | null = null;

  const rawTermsSnapshot = body?.terms_snapshot;
  if (!rawTermsSnapshot || typeof rawTermsSnapshot !== "object") {
    return json(422, { error: "terms_snapshot is required" });
  }

  const rawInputs =
    rawTermsSnapshot?.inputs && typeof rawTermsSnapshot.inputs === "object"
      ? rawTermsSnapshot.inputs
      : {
          deal_terms:
            rawTermsSnapshot?.deal_terms &&
            typeof rawTermsSnapshot.deal_terms === "object"
              ? rawTermsSnapshot.deal_terms
              : null,
          scenario:
            rawTermsSnapshot?.scenario &&
            typeof rawTermsSnapshot.scenario === "object"
              ? rawTermsSnapshot.scenario
              : null,
        };

  const normalizedInputs = ensureScenario(rawInputs);

  if (
    !normalizedInputs?.deal_terms ||
    typeof normalizedInputs.deal_terms !== "object"
  ) {
    return json(422, { error: "terms_snapshot must include deal_terms" });
  }

  const computeResult = await computeDeal(normalizedInputs);
  if (!computeResult.ok) {
    return json(500, {
      error:
        computeResult.error ?? "Failed to compute submitted offer snapshot",
    });
  }

  if (mode === "verified_owner") {
    if (prop.status !== "verified" || !prop.owner_user_id) {
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

  let canonicalHeader: Record<string, unknown> | undefined;
  try {
    const { data: headerEv } = await (svc.from("deal_events") as any)
      .select("payload")
      .eq("deal_id", dealId)
      .eq("event_type", "DEAL_HEADER_UPDATED")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (headerEv?.payload && typeof headerEv.payload === "object") {
      const p = headerEv.payload;
      if (p.property_id || p.display_address || p.title) {
        canonicalHeader = {
          title: p.title ?? null,
          property_id: p.property_id ?? null,
          display_address: p.display_address ?? null,
          property_status: p.property_status ?? null,
          ownership_status: p.ownership_status ?? null,
        };
      }
    }
  } catch (headerReadErr: any) {
    console.error(
      "submit_offer_canonical_header_read_error",
      headerReadErr?.message,
    );
  }

  const computedAt = new Date().toISOString();
  const fullSnapshot: Record<string, unknown> = {
    contract_version: CONTRACT_VERSION,
    schema_version: SCHEMA_VERSION,
    inputs: normalizedInputs,
    outputs: { results: computeResult.result.results },
    computed_at: computedAt,
    computed_by: user.id,
    compute_version: computeResult.result.compute_version,
  };

  if (canonicalHeader) {
    fullSnapshot.meta = { header: canonicalHeader };
  }

  const { data: proposal, error: propErr } = await (
    svc.from("deal_proposals") as any
  )
    .insert({
      thread_id: thread.id,
      created_by_user_id: user.id,
      status: "submitted",
      terms_snapshot: fullSnapshot,
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

  const knownInviteeEmail =
    mode === "known_email" ? normalizeEmail(body?.invitee_email) : null;

  if (mode === "known_email" && knownInviteeEmail) {
    const crypto = await import("crypto");
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    await (svc.from("thread_invites") as any).insert({
      thread_id: thread.id,
      intended_role: "owner",
      invitee_email: knownInviteeEmail,
      token_hash: tokenHash,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      created_by_user_id: user.id,
    });

    try {
      let inviteeUserId: string | null = null;
      let page = 1;
      const perPage = 100;

      while (!inviteeUserId) {
        const { data: listData } = await svc.auth.admin.listUsers({
          page,
          perPage,
        });
        const users = listData?.users ?? [];
        const match = users.find(
          (u: any) => u.email?.toLowerCase() === knownInviteeEmail,
        );

        if (match) {
          inviteeUserId = match.id;
          break;
        }

        if (users.length < perPage) break;
        page++;
      }

      if (inviteeUserId && inviteeUserId !== user.id) {
        await (svc.from("deal_access_grants") as any).upsert(
          {
            deal_id: dealId,
            user_id: inviteeUserId,
            role: "VIEWER",
            created_by: user.id,
            revoked_at: null,
            expires_at: null,
          },
          { onConflict: "deal_id,user_id" },
        );
      }
    } catch (grantErr: any) {
      console.error("submit_offer_known_email_grant_error", {
        dealId,
        email: knownInviteeEmail,
        error: grantErr?.message,
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

  if (prop.owner_user_id && prop.owner_user_id !== user.id) {
    const { error: dealOwnerUpdErr } = await (svc.from("deals") as any)
      .update({ owner_user_id: prop.owner_user_id })
      .eq("id", dealId)
      .eq("status", "DRAFT");

    if (dealOwnerUpdErr) {
      console.error("submit_offer_set_deal_owner_error", dealOwnerUpdErr);
      return json(500, { error: dealOwnerUpdErr.message });
    }

    const { error: ownerGrantErr } = await (
      svc.from("deal_access_grants") as any
    ).upsert(
      {
        deal_id: dealId,
        user_id: prop.owner_user_id,
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

  const { error: eventErr } = await (svc.from("deal_events") as any).insert({
    deal_id: dealId,
    event_type: "offer_submitted",
    payload: { thread_id: thread.id, proposal_id: proposal.id, mode },
    created_by: user.id,
  });

  if (eventErr) {
    console.error("submit_offer_event_insert_error", eventErr);
    return json(500, { error: eventErr.message });
  }

  const APP = getAppBaseUrlServer();
  const fromEmail =
    process.env.RESEND_FROM_EMAIL ?? "notifications@notify.fractpath.com";
  const propertyAddress = resolvePropertyAddress(canonicalHeader);

  const buyerEmail = normalizeEmail(user.email);
  const buyerActionUrl = `${APP}/deal/${dealId}`;

  let homeownerEmail: string | null = null;

  if (prop.owner_user_id && prop.owner_user_id !== user.id) {
    try {
      const { data: ownerUser } = await svc.auth.admin.getUserById(
        prop.owner_user_id,
      );
      homeownerEmail = normalizeEmail(ownerUser?.user?.email);
    } catch (emailLookupErr: any) {
      console.error("submit_offer_owner_email_lookup_failed", {
        dealId,
        ownerUserId: prop.owner_user_id,
        error: emailLookupErr?.message,
      });
    }
  }

  if (!homeownerEmail && knownInviteeEmail) {
    homeownerEmail = knownInviteeEmail;
  }

  const homeownerActionUrl = `${APP}/deal/${dealId}#offer`;

  console.log("SUBMIT_EMAIL_ROUTING", {
    dealId,
    mode,
    buyerEmail,
    homeownerEmail,
    buyerTemplate: process.env.RESEND_TEMPLATE_BUYER_OFFER_SUBMITTED_ID,
    homeownerTemplate: process.env.RESEND_TEMPLATE_HOMEOWNER_OFFER_SUBMITTED_ID,
    propertyAddress,
  });

  if (buyerEmail) {
    try {
      await sendTemplateEmail({
        to: buyerEmail,
        from: fromEmail,
        subject: "Your FractPath offer was submitted",
        template: {
          id:
            process.env.RESEND_TEMPLATE_BUYER_OFFER_SUBMITTED_ID ??
            "fractpath-buyer-offer-submitted-1",
          variables: {
            property_address: propertyAddress,
            ACTION_URL: buyerActionUrl,
          },
        },
      });
    } catch (emailErr: any) {
      console.error("submit_offer_buyer_email_failed", {
        dealId,
        buyerEmail,
        error: emailErr?.message,
      });
    }
  }

  if (homeownerEmail) {
    try {
      await sendTemplateEmail({
        to: homeownerEmail,
        from: fromEmail,
        subject: "A new FractPath offer is ready for review",
        template: {
          id:
            process.env.RESEND_TEMPLATE_HOMEOWNER_OFFER_SUBMITTED_ID ??
            "fractpath-homeowner-offer-submitted",
          variables: {
            property_address: propertyAddress,
            ACTION_URL: homeownerActionUrl,
          },
        },
      });
    } catch (emailErr: any) {
      console.error("submit_offer_homeowner_email_failed", {
        dealId,
        homeownerEmail,
        error: emailErr?.message,
      });
    }
  }

  return json(200, {
    ok: true,
    thread_id: thread.id,
    proposal_id: proposal.id,
    mode,
  });
}
