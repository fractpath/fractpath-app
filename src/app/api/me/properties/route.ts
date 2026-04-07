import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  enforceLimitsAndProcess,
  type DocProcessingMeta,
} from "@/lib/uploads/documentProcessing";
import { normalizeAddress } from "@/lib/propertyResolve";
import {
  toHomeownerProperty,
  toClaimableProperty,
} from "@/lib/property/projections";

export const runtime = "nodejs";

const REQUIRED_DOC_TYPES = [
  "selfie",
  "drivers_license",
  "utility_bill",
] as const;
const BUCKET = "property-verification";

function jsonError(msg: string, status: number) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

function formatAddress(row: Record<string, any>): string {
  return [
    row.address_line1,
    row.address_line2,
    row.city,
    row.state,
    row.postal_code,
  ]
    .filter(Boolean)
    .join(", ");
}

// Columns to fetch for properties owned by this user (includes homeowner-visible debt + intake fields)
const OWNED_SELECT =
  "id, address_line1, address_line2, city, state, postal_code, status, ownership_status, is_private, owner_user_id, claimed_by_user_id, created_by_user_id, created_at, updated_at, has_secured_property_debt, secured_property_debt_amount, secured_debt_verification_status, secured_debt_fresh_until, ownership_type, occupancy_use, occupancy_use_other, major_condition_issue, major_condition_issue_details, known_liens_and_claims, total_known_debt_amount, total_known_debt_confidence, debt_statement_availability, title_claims_known, title_claims_details, owner_stated_fmv, owner_stated_fmv_confidence, owner_stated_fmv_source, owner_stated_fmv_source_other, willing_to_proceed_formal_review, proposal_interest_status, visibility_preference, proposal_preferences_acknowledged_at";

// Columns to fetch for claimable properties (cross-user — no underwriting data)
const CLAIMABLE_SELECT =
  "id, address_line1, address_line2, city, state, postal_code, status, ownership_status, is_private, owner_user_id, claimed_by_user_id, created_by_user_id, created_at, updated_at";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return jsonError("Unauthorized", 401);

  const svc = createServiceClient();
  const email = user.email?.toLowerCase() ?? null;

  const { data: ownedData, error: ownedErr } = await (
    svc.from("properties") as any
  )
    .select(OWNED_SELECT)
    .or(
      `owner_user_id.eq.${user.id},created_by_user_id.eq.${user.id},claimed_by_user_id.eq.${user.id}`,
    )
    .order("updated_at", { ascending: false });

  if (ownedErr) return jsonError(ownedErr.message, 500);

  let claimableProperties: any[] = [];

  // 2) Claimable / owner-visible properties for known_email pending-owner flow.
  // Support all four bridges:
  // - email invite
  // - active owner participant row
  // - deal_thread.owner_user_id already attached to this user
  // - active deal_access_grants -> deal_threads.deal_id
  {
    const threadIdSet = new Set<string>();
    const grantedDealIdSet = new Set<string>();

    if (email) {
      const { data: invites, error: invitesErr } = await (
        svc.from("thread_invites") as any
      )
        .select("thread_id, invitee_email, intended_role, expires_at")
        .eq("invitee_email", email)
        .eq("intended_role", "owner");

      if (invitesErr) return jsonError(invitesErr.message, 500);

      for (const inv of invites ?? []) {
        const notExpired =
          !inv?.expires_at || new Date(inv.expires_at) > new Date();
        if (notExpired && inv?.thread_id) {
          threadIdSet.add(inv.thread_id);
        }
      }
    }

    const { data: participantRows, error: participantErr } = await (
      svc.from("deal_thread_participants") as any
    )
      .select("thread_id, role, status")
      .eq("user_id", user.id)
      .eq("role", "owner")
      .eq("status", "active");

    if (participantErr) return jsonError(participantErr.message, 500);

    for (const row of participantRows ?? []) {
      if (row?.thread_id) threadIdSet.add(row.thread_id);
    }

    const { data: ownerThreads, error: ownerThreadsErr } = await (
      svc.from("deal_threads") as any
    )
      .select("id")
      .eq("owner_user_id", user.id);

    if (ownerThreadsErr) return jsonError(ownerThreadsErr.message, 500);

    for (const row of ownerThreads ?? []) {
      if (row?.id) threadIdSet.add(row.id);
    }

    const { data: grants, error: grantsErr } = await (
      svc.from("deal_access_grants") as any
    )
      .select("deal_id, role, revoked_at")
      .eq("user_id", user.id)
      .is("revoked_at", null);

    if (grantsErr) return jsonError(grantsErr.message, 500);

    for (const row of grants ?? []) {
      if (row?.deal_id) grantedDealIdSet.add(row.deal_id);
    }

    if (grantedDealIdSet.size > 0) {
      const { data: grantThreads, error: grantThreadsErr } = await (
        svc.from("deal_threads") as any
      )
        .select("id")
        .in("deal_id", Array.from(grantedDealIdSet));

      if (grantThreadsErr) return jsonError(grantThreadsErr.message, 500);

      for (const row of grantThreads ?? []) {
        if (row?.id) threadIdSet.add(row.id);
      }
    }

    const threadIds = Array.from(threadIdSet);

    if (threadIds.length > 0) {
      const { data: threads, error: threadsErr } = await (
        svc.from("deal_threads") as any
      )
        .select("id, property_id, status, deal_id, owner_user_id")
        .in("id", threadIds);

      if (threadsErr) return jsonError(threadsErr.message, 500);

      const propertyIds = (threads ?? [])
        .map((t: any) => t.property_id)
        .filter(Boolean);

      if (propertyIds.length > 0) {
        // Use narrow claimable select — no underwriting data for cross-user properties
        const { data: props, error: propsErr } = await (
          svc.from("properties") as any
        )
          .select(CLAIMABLE_SELECT)
          .in("id", propertyIds);

        if (propsErr) return jsonError(propsErr.message, 500);

        const threadByPropertyId = new Map<string, any>();
        for (const thread of threads ?? []) {
          if (!thread?.property_id) continue;
          if (!threadByPropertyId.has(thread.property_id)) {
            threadByPropertyId.set(thread.property_id, thread);
          }
        }

        claimableProperties = (props ?? [])
          .map((p: any) => {
            const thread = threadByPropertyId.get(p.id) ?? null;
            return {
              ...p,
              claim_thread_id: thread?.id ?? null,
              claim_deal_id: thread?.deal_id ?? null,
              claim_thread_status: thread?.status ?? null,
            };
          })
          .filter((p: any) => {
            const thread = threadByPropertyId.get(p.id) ?? null;

            const ownershipStatus = p.ownership_status ?? null;
            const ownerUserId = p.owner_user_id ?? null;
            const claimedByUserId = p.claimed_by_user_id ?? null;

            const explicitlyUnclaimed =
              !ownershipStatus || ownershipStatus === "unclaimed";

            const alreadyClaimedByThisUser =
              claimedByUserId === user.id || ownerUserId === user.id;

            const alreadyClaimedByAnotherUser =
              ownershipStatus === "claimed" &&
              !!(claimedByUserId || ownerUserId) &&
              !alreadyClaimedByThisUser;

            const threadAlreadyAttachedToThisUser =
              !!thread?.owner_user_id && thread.owner_user_id === user.id;

            const grantedDealVisibleToThisUser =
              !!thread?.deal_id && grantedDealIdSet.has(thread.deal_id);

            const inviteOrBridgeVisible =
              !!p.claim_thread_id &&
              (threadAlreadyAttachedToThisUser || grantedDealVisibleToThisUser);

            const isClaimable =
              !alreadyClaimedByAnotherUser &&
              (explicitlyUnclaimed ||
                alreadyClaimedByThisUser ||
                inviteOrBridgeVisible);

            return isClaimable && !!p.claim_thread_id;
          });
      }
    }
  }

  const byId = new Map<string, any>();

  for (const r of ownedData ?? []) {
    const addressDisplay = formatAddress(r);
    const isOwnedByThisUser =
      r.owner_user_id === user.id || r.claimed_by_user_id === user.id;
    byId.set(
      r.id,
      toHomeownerProperty(r, {
        address_display: addressDisplay,
        visibility: isOwnedByThisUser ? "owned" : "created",
        claim_thread_id: null,
        claim_deal_id: null,
        claim_thread_status: null,
      }),
    );
  }

  for (const r of claimableProperties) {
    if (!byId.has(r.id)) {
      const addressDisplay = formatAddress(r);
      byId.set(
        r.id,
        toClaimableProperty(r, {
          address_display: addressDisplay,
          claim_thread_id: r.claim_thread_id ?? null,
          claim_deal_id: r.claim_deal_id ?? null,
          claim_thread_status: r.claim_thread_status ?? null,
        }),
      );
    }
  }

  // Enrich owned properties with review_request_status (open/submitted) — best-effort, non-fatal
  {
    const ownedPropertyIds = Array.from(byId.keys());
    if (ownedPropertyIds.length > 0) {
      try {
        // Resolve property_id -> deal_id via deal_threads
        const { data: propThreads } = await (svc.from("deal_threads") as any)
          .select("property_id, deal_id")
          .in("property_id", ownedPropertyIds)
          .not("deal_id", "is", null);

        const propToDealId = new Map<string, string>();
        for (const row of propThreads ?? []) {
          if (row?.property_id && row?.deal_id && !propToDealId.has(row.property_id)) {
            propToDealId.set(row.property_id, row.deal_id);
          }
        }

        if (propToDealId.size > 0) {
          const dealIds = Array.from(propToDealId.values());
          const { data: requests } = await (svc.from("deal_review_requests") as any)
            .select("deal_id, property_id, status")
            .in("deal_id", dealIds)
            .in("status", ["open", "submitted"])
            .order("created_at", { ascending: false });

          const reviewStatusByPropertyId = new Map<string, "open" | "submitted">();
          for (const req of requests ?? []) {
            if (req?.property_id && !reviewStatusByPropertyId.has(req.property_id)) {
              reviewStatusByPropertyId.set(req.property_id, req.status as "open" | "submitted");
            }
          }

          for (const [id, prop] of byId.entries()) {
            const rrStatus = reviewStatusByPropertyId.get(id) ?? null;
            if (rrStatus) {
              byId.set(id, { ...prop, review_request_status: rrStatus });
            }
          }
        }
      } catch {
        // best-effort — do not fail the response
      }
    }
  }

  let rows = Array.from(byId.values()).sort((a: any, b: any) => {
    const aTime = new Date(a.updated_at ?? a.created_at ?? 0).getTime();
    const bTime = new Date(b.updated_at ?? b.created_at ?? 0).getTime();
    return bTime - aTime;
  });

  // Enrich properties with enrichment thumbnail — best-effort, non-fatal
  {
    const allIds = rows.map((r: any) => r.id).filter(Boolean);
    if (allIds.length > 0) {
      try {
        const { data: enrichRows } = await (svc.from("property_enrichments") as any)
          .select("property_id, images_payload")
          .in("property_id", allIds)
          .eq("is_current", true)
          .eq("provider", "mashvisor")
          .not("images_payload", "is", null);

        const thumbnailMap = new Map<string, string | null>();
        for (const e of enrichRows ?? []) {
          const url = e?.images_payload?.cover_image_url ?? null;
          thumbnailMap.set(e.property_id, url);
        }

        if (thumbnailMap.size > 0) {
          rows = rows.map((r: any) => {
            const thumb = thumbnailMap.get(r.id);
            return thumb !== undefined ? { ...r, cover_image_url: thumb } : r;
          });
        }
      } catch {
        // best-effort — do not fail the response
      }
    }
  }

  return NextResponse.json({ ok: true, properties: rows });
}

async function ensureBucket(svc: ReturnType<typeof createServiceClient>) {
  const { data } = await svc.storage.getBucket(BUCKET);
  if (!data) {
    await svc.storage.createBucket(BUCKET, { public: false });
  }
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError("Unauthorized", 401);

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return jsonError("Expected multipart form data", 400);
  }

  const address_line1 = String(formData.get("address_line1") ?? "").trim();
  const address_line2 = String(formData.get("address_line2") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const state = String(formData.get("state") ?? "").trim();
  const postal_code = String(formData.get("postal_code") ?? "").trim();

  if (!address_line1) return jsonError("Street address is required", 422);
  if (!state) return jsonError("State is required", 422);
  if (!postal_code) return jsonError("Zip code is required", 422);

  const files: Record<string, File> = {};
  for (const docType of REQUIRED_DOC_TYPES) {
    const file = formData.get(docType);
    if (!file || !(file instanceof File) || file.size === 0) {
      return jsonError(`${docType.replace("_", " ")} photo is required`, 422);
    }
    files[docType] = file;
  }

  // --- Secured debt declaration ---
  const hasSecuredDebtRaw = formData.get("has_secured_debt");
  const hasSecuredDebt: boolean | null =
    hasSecuredDebtRaw === "true"
      ? true
      : hasSecuredDebtRaw === "false"
        ? false
        : null;

  const securedDebtAmountRaw = formData.get("secured_debt_amount");
  const securedDebtAmount: number | null =
    hasSecuredDebt === true && securedDebtAmountRaw !== null
      ? parseFloat(String(securedDebtAmountRaw))
      : null;

  const securedDebtCertified =
    hasSecuredDebt === true &&
    formData.get("secured_debt_certified") === "true";

  const debtStatementFiles = formData.getAll("secured_debt_statement").filter(
    (f): f is File => f instanceof File && f.size > 0,
  );

  if (hasSecuredDebt === true) {
    if (
      securedDebtAmount === null ||
      isNaN(securedDebtAmount) ||
      securedDebtAmount < 0
    ) {
      return jsonError("Secured debt amount must be a non-negative number", 422);
    }
    if (debtStatementFiles.length === 0) {
      return jsonError(
        "At least one loan statement is required when secured debt is declared",
        422,
      );
    }
    if (!securedDebtCertified) {
      return jsonError(
        "You must certify that the loan information is accurate",
        422,
      );
    }
  }

  const svc = createServiceClient();

  let propertyId: string | null = null;
  let createdNewProperty = false;

  const displayParts = [address_line1, address_line2, city, state, postal_code]
    .filter(Boolean)
    .join(", ");
  const computed_normalized = normalizeAddress(displayParts);

  const { data: existingProperty, error: existingErr } = await (
    svc.from("properties") as any
  )
    .select("id, owner_user_id, claimed_by_user_id, ownership_status, status")
    .eq("normalized_address", computed_normalized || "")
    .maybeSingle();

  if (existingErr) {
    return jsonError(existingErr.message, 500);
  }

  // Debt columns to persist
  const debtVerificationStatus =
    hasSecuredDebt === null
      ? null
      : hasSecuredDebt === false
        ? "not_applicable"
        : "pending";

  const debtColumns: Record<string, any> = {};
  if (hasSecuredDebt !== null) {
    debtColumns.has_secured_property_debt = hasSecuredDebt;
    debtColumns.secured_debt_verification_status = debtVerificationStatus;

    if (hasSecuredDebt === true) {
      const nowIso = new Date().toISOString();
      const freshUntilIso = new Date(
        Date.now() + 90 * 24 * 60 * 60 * 1000,
      ).toISOString();

      debtColumns.secured_property_debt_amount = securedDebtAmount;
      debtColumns.secured_debt_certified_at = nowIso;
      debtColumns.secured_debt_last_verified_at = nowIso;
      debtColumns.secured_debt_fresh_until = freshUntilIso;
    } else {
      debtColumns.secured_property_debt_amount = null;
      debtColumns.secured_debt_certified_at = null;
      debtColumns.secured_debt_last_verified_at = null;
      debtColumns.secured_debt_fresh_until = null;
    }
  }

  // --- Sprint 16 intake fields ---
  function strOrNull(key: string): string | null {
    const v = String(formData.get(key) ?? "").trim();
    return v === "" ? null : v;
  }
  function numOrNull(key: string): number | null {
    const v = String(formData.get(key) ?? "").trim();
    if (v === "") return null;
    const n = parseFloat(v.replace(/[^0-9.]/g, ""));
    return isNaN(n) ? null : n;
  }

  const intakeColumns: Record<string, any> = {
    ownership_type: strOrNull("ownership_type"),
    occupancy_use: strOrNull("occupancy_use"),
    occupancy_use_other: strOrNull("occupancy_use_other"),
    major_condition_issue: strOrNull("major_condition_issue"),
    major_condition_issue_details: strOrNull("major_condition_issue_details"),
    known_liens_and_claims: (() => {
      const vals = formData
        .getAll("known_liens_and_claims")
        .map((v) => String(v).trim())
        .filter(Boolean);
      return vals.length > 0 ? vals : null;
    })(),
    total_known_debt_amount: numOrNull("total_known_debt_amount"),
    total_known_debt_confidence: strOrNull("total_known_debt_confidence"),
    debt_statement_availability: strOrNull("debt_statement_availability"),
    title_claims_known: strOrNull("title_claims_known"),
    title_claims_details: strOrNull("title_claims_details"),
    owner_stated_fmv: numOrNull("owner_stated_fmv"),
    owner_stated_fmv_confidence: strOrNull("owner_stated_fmv_confidence"),
    owner_stated_fmv_source: strOrNull("owner_stated_fmv_source"),
    owner_stated_fmv_source_other: strOrNull("owner_stated_fmv_source_other"),
    willing_to_proceed_formal_review: strOrNull(
      "willing_to_proceed_formal_review",
    ),
  };

  // Strip undefined intake columns so we don't accidentally null out existing
  // data when the form only submits a partial update.
  const activeIntakeColumns: Record<string, any> = {};
  for (const [k, v] of Object.entries(intakeColumns)) {
    if (v !== null) activeIntakeColumns[k] = v;
  }

  // --- Proposal preferences ---
  const proposalInterestStatus = strOrNull("proposal_interest_status");
  const visibilityPref = strOrNull("visibility_preference");
  const proposalAcknowledged = formData.get("proposal_preferences_acknowledged") === "true";
  const propPrefsColumns: Record<string, any> = {};
  if (proposalInterestStatus === "not_interested" || proposalInterestStatus === "interested_after_verification") {
    propPrefsColumns.proposal_interest_status = proposalInterestStatus;
    propPrefsColumns.visibility_preference =
      proposalInterestStatus === "interested_after_verification"
        ? (visibilityPref === "private" || visibilityPref === "matched" || visibilityPref === "public"
            ? visibilityPref
            : "private")
        : "private";
    if (proposalInterestStatus === "interested_after_verification" && proposalAcknowledged) {
      propPrefsColumns.proposal_preferences_acknowledged_at = new Date().toISOString();
    }
  }

  if (existingProperty) {
    const ownedByAnotherUser =
      !!existingProperty.owner_user_id &&
      existingProperty.owner_user_id !== user.id;

    const claimedByAnotherUser =
      !!existingProperty.claimed_by_user_id &&
      existingProperty.claimed_by_user_id !== user.id;

    if (ownedByAnotherUser || claimedByAnotherUser) {
      return jsonError("This property is already claimed by another user", 409);
    }

    const { data: updatedProperty, error: updateErr } = await (
      svc.from("properties") as any
    )
      .update({
        owner_user_id: user.id,
        claimed_by_user_id: user.id,
        ownership_status: "claimed",
        address_line1,
        address_line2: address_line2 || null,
        city: city || null,
        state,
        postal_code,
        is_private: true,
        normalized_address: computed_normalized || null,
        ...debtColumns,
        ...activeIntakeColumns,
        ...propPrefsColumns,
      })
      .eq("id", existingProperty.id)
      .select("id")
      .single();

    if (updateErr) {
      return jsonError(updateErr.message, 500);
    }

    propertyId = updatedProperty.id;
  } else {
    const { data: prop, error: insertErr } = await (
      svc.from("properties") as any
    )
      .insert({
        owner_user_id: user.id,
        claimed_by_user_id: user.id,
        ownership_status: "claimed",
        created_by_user_id: user.id,
        address_line1,
        address_line2: address_line2 || null,
        city: city || null,
        state,
        postal_code,
        status: "unverified",
        is_private: true,
        normalized_address: computed_normalized || null,
        ...debtColumns,
        ...activeIntakeColumns,
        ...propPrefsColumns,
      })
      .select("id")
      .single();

    if (insertErr) return jsonError(insertErr.message, 500);

    propertyId = prop.id;
    createdNewProperty = true;
  }

  if (!propertyId) {
    return jsonError("Failed to resolve property record", 500);
  }

  await ensureBucket(svc);

  const docRows: Array<Record<string, any>> = [];

  for (const docType of REQUIRED_DOC_TYPES) {
    const file = files[docType];
    const rawBuf = Buffer.from(await file.arrayBuffer());

    const result = await enforceLimitsAndProcess(rawBuf, file.type);
    if (!result.ok) {
      if (createdNewProperty) {
        await (svc.from("properties") as any).delete().eq("id", propertyId);
      }
      return jsonError(
        `${docType.replace("_", " ")}: ${result.error}`,
        result.status,
      );
    }

    const storagePath = `${user.id}/${propertyId}/${docType}.${result.ext}`;

    const { error: uploadErr } = await svc.storage
      .from(BUCKET)
      .upload(storagePath, result.outBuf, {
        contentType: result.storedContentType,
        upsert: true,
      });

    if (uploadErr) {
      if (createdNewProperty) {
        await (svc.from("properties") as any).delete().eq("id", propertyId);
      }
      return jsonError(
        `Upload failed for ${docType}: ${uploadErr.message}`,
        500,
      );
    }

    const row: Record<string, any> = {
      property_id: propertyId,
      doc_type: docType,
      storage_path: storagePath,
      content_type: result.storedContentType,
      byte_size: result.meta.byte_size,
      sha256: result.meta.sha256,
      width: result.meta.width,
      height: result.meta.height,
      original_content_type: result.meta.original_content_type,
    };

    console.info("PROPERTY_DOC_UPLOAD", {
      property_id: propertyId,
      doc_type: docType,
      ...result.meta,
    });

    docRows.push(row);
  }

  const { error: docInsertErr } = await (
    svc.from("property_documents") as any
  ).insert(docRows);

  if (docInsertErr) {
    return jsonError(`Document records failed: ${docInsertErr.message}`, 500);
  }

  // --- Process and upload secured debt statement files ---
  if (hasSecuredDebt === true && debtStatementFiles.length > 0) {
    const debtDocRows: Array<Record<string, any>> = [];

    for (let i = 0; i < debtStatementFiles.length; i++) {
      const file = debtStatementFiles[i];
      const rawBuf = Buffer.from(await file.arrayBuffer());

      const result = await enforceLimitsAndProcess(rawBuf, file.type);
      if (!result.ok) {
        return jsonError(`Loan statement ${i + 1}: ${result.error}`, result.status);
      }

      // Debt statements are keyed by index to avoid collisions
      const storagePath = `${user.id}/${propertyId}/secured_debt_statement_${Date.now()}_${i}.${result.ext}`;

      const { error: uploadErr } = await svc.storage
        .from(BUCKET)
        .upload(storagePath, result.outBuf, {
          contentType: result.storedContentType,
          upsert: false,
        });

      if (uploadErr) {
        return jsonError(`Loan statement upload failed: ${uploadErr.message}`, 500);
      }

      const debtRow: Record<string, any> = {
        property_id: propertyId,
        doc_type: "secured_debt_statement",
        storage_path: storagePath,
        content_type: result.storedContentType,
        byte_size: result.meta.byte_size,
        sha256: result.meta.sha256,
        width: result.meta.width ?? null,
        height: result.meta.height ?? null,
        original_content_type: result.meta.original_content_type,
      };

      console.info("PROPERTY_DEBT_DOC_UPLOAD", {
        property_id: propertyId,
        doc_type: "secured_debt_statement",
        index: i,
        ...result.meta,
      });

      debtDocRows.push(debtRow);
    }

    const { error: debtDocInsertErr } = await (
      svc.from("property_documents") as any
    ).insert(debtDocRows);

    if (debtDocInsertErr) {
      return jsonError(
        `Debt document records failed: ${debtDocInsertErr.message}`,
        500,
      );
    }
  }

  // --- Process optional supporting document uploads (upsert by property_id,doc_type) ---
  const SUPPORTING_DOC_TYPES_POST = [
    "mortgage_statement", "heloc_statement", "second_lien_statement",
    "tax_lien_notice", "judgment_document", "hoa_lien_notice",
    "other_claim_document", "appraisal_report", "cma_report",
    "online_estimate_screenshot", "listing_or_offer_document",
    "trust_document", "estate_document", "condition_supporting_document",
  ] as const;

  for (const docType of SUPPORTING_DOC_TYPES_POST) {
    const file = formData.get(docType);
    if (!file || !(file instanceof File) || file.size === 0) continue;

    const rawBuf = Buffer.from(await file.arrayBuffer());
    const result = await enforceLimitsAndProcess(rawBuf, file.type);
    if (!result.ok) {
      return jsonError(`${docType.replace(/_/g, " ")}: ${result.error}`, result.status);
    }

    const storagePath = `${user.id}/${propertyId}/${docType}.${result.ext}`;

    const { error: supUploadErr } = await svc.storage
      .from(BUCKET)
      .upload(storagePath, result.outBuf, {
        contentType: result.storedContentType,
        upsert: true,
      });

    if (supUploadErr) {
      return jsonError(
        `Upload failed for ${docType.replace(/_/g, " ")}: ${supUploadErr.message}`,
        500,
      );
    }

    const { error: supUpsertErr } = await (svc.from("property_documents") as any).upsert(
      {
        property_id: propertyId,
        doc_type: docType,
        storage_path: storagePath,
        content_type: result.storedContentType,
        byte_size: result.meta.byte_size,
        sha256: result.meta.sha256,
        width: result.meta.width ?? null,
        height: result.meta.height ?? null,
        original_content_type: result.meta.original_content_type,
      },
      { onConflict: "property_id,doc_type" },
    );

    if (supUpsertErr) {
      return jsonError(
        `Document record failed for ${docType.replace(/_/g, " ")}: ${supUpsertErr.message}`,
        500,
      );
    }

    console.info("PROPERTY_SUPPORTING_DOC_UPLOAD", {
      property_id: propertyId,
      doc_type: docType,
      ...result.meta,
    });
  }

  // --- Record underwriting snapshot (append-only audit trail) ---
  if (hasSecuredDebt !== null) {
    await (svc.from("property_underwriting_snapshots") as any).insert({
      property_id: propertyId,
      captured_by: user.id,
      actor_type: "owner",
      snapshot_source: "owner_declaration",
      has_secured_property_debt: hasSecuredDebt,
      secured_property_debt_amount:
        hasSecuredDebt === true ? securedDebtAmount : null,
      ltv_policy_ratio: 0.75,
    });
  }

  return NextResponse.json(
    { ok: true, property: { id: propertyId, status: "unverified" } },
    { status: 201 },
  );
}
