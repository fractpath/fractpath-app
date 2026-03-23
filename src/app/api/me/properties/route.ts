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

// Columns to fetch for properties owned by this user (includes homeowner-visible debt fields)
const OWNED_SELECT =
  "id, address_line1, address_line2, city, state, postal_code, status, ownership_status, is_private, owner_user_id, claimed_by_user_id, created_by_user_id, created_at, updated_at, has_secured_property_debt, secured_property_debt_amount, secured_debt_verification_status, secured_debt_fresh_until";

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

  const rows = Array.from(byId.values()).sort((a: any, b: any) => {
    const aTime = new Date(a.updated_at ?? a.created_at ?? 0).getTime();
    const bTime = new Date(b.updated_at ?? b.created_at ?? 0).getTime();
    return bTime - aTime;
  });

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
      debtColumns.secured_property_debt_amount = securedDebtAmount;
      debtColumns.secured_debt_certified_at = new Date().toISOString();
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
