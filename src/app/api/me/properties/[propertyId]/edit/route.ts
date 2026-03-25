import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { enforceLimitsAndProcess } from "@/lib/uploads/documentProcessing";
import { normalizeAddress } from "@/lib/propertyResolve";

export const runtime = "nodejs";

const BUCKET = "property-verification";
const ALLOWED_DOC_TYPES = ["selfie", "drivers_license", "utility_bill"] as const;

const SUPPORTING_DOC_TYPES = [
  "mortgage_statement",
  "heloc_statement",
  "second_lien_statement",
  "tax_lien_notice",
  "judgment_document",
  "hoa_lien_notice",
  "other_claim_document",
  "appraisal_report",
  "cma_report",
  "online_estimate_screenshot",
  "listing_or_offer_document",
  "trust_document",
  "estate_document",
  "condition_supporting_document",
] as const;

function jsonError(msg: string, status: number) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ propertyId: string }> },
) {
  const { propertyId } = await ctx.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError("Unauthorized", 401);

  const svc = createServiceClient();
  const { data: existing } = await (svc.from("properties") as any)
    .select("id, status, owner_user_id")
    .eq("id", propertyId)
    .or(
      `owner_user_id.eq.${user.id},created_by_user_id.eq.${user.id},claimed_by_user_id.eq.${user.id}`,
    )
    .maybeSingle();

  if (!existing) return jsonError("Not found", 404);
  // Note: edits after verification may require re-review in a future workflow.

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

  const displayParts = [address_line1, address_line2, city, state, postal_code].filter(Boolean).join(", ");
  const computed_normalized = normalizeAddress(displayParts);

  // Build update payload
  const updatePayload: Record<string, any> = {
    address_line1,
    address_line2: address_line2 || null,
    city: city || null,
    state,
    postal_code,
    normalized_address: computed_normalized || null,
  };

  // Debt declaration update (optional during edit)
  const hasSecuredDebtRaw = formData.get("has_secured_debt");
  if (hasSecuredDebtRaw === "true" || hasSecuredDebtRaw === "false") {
    const hasSecuredDebt = hasSecuredDebtRaw === "true";
    updatePayload.has_secured_property_debt = hasSecuredDebt;
    updatePayload.secured_debt_verification_status = hasSecuredDebt
      ? "pending"
      : "not_applicable";

    if (hasSecuredDebt) {
      const amountRaw = formData.get("secured_debt_amount");
      if (amountRaw !== null) {
        const amount = parseFloat(String(amountRaw));
        if (!isNaN(amount) && amount >= 0) {
          updatePayload.secured_property_debt_amount = amount;
        }
      }

      if (formData.get("secured_debt_certified") === "true") {
        const nowIso = new Date().toISOString();
        const freshUntilIso = new Date(
          Date.now() + 90 * 24 * 60 * 60 * 1000,
        ).toISOString();

        updatePayload.secured_debt_certified_at = nowIso;
        updatePayload.secured_debt_last_verified_at = nowIso;
        updatePayload.secured_debt_fresh_until = freshUntilIso;
      }
    } else {
      // Clearing debt declaration
      updatePayload.secured_property_debt_amount = null;
      updatePayload.secured_debt_certified_at = null;
      updatePayload.secured_debt_last_verified_at = null;
      updatePayload.secured_debt_fresh_until = null;
    }
  }

  // Sprint 16 intake fields — all optional during edit; only update when provided
  function strField(key: string): string | null {
    const v = String(formData.get(key) ?? "").trim();
    return v === "" ? null : v;
  }
  function numField(key: string): number | null {
    const v = String(formData.get(key) ?? "").trim();
    if (v === "") return null;
    const n = parseFloat(v.replace(/[^0-9.]/g, ""));
    return isNaN(n) ? null : n;
  }

  const intakeFields: Record<string, any> = {
    ownership_type: strField("ownership_type"),
    occupancy_use: strField("occupancy_use"),
    occupancy_use_other: strField("occupancy_use_other"),
    major_condition_issue: strField("major_condition_issue"),
    major_condition_issue_details: strField("major_condition_issue_details"),
    known_liens_and_claims: (() => {
      const vals = formData
        .getAll("known_liens_and_claims")
        .map((v) => String(v).trim())
        .filter(Boolean);
      return vals.length > 0 ? vals : null;
    })(),
    total_known_debt_amount: numField("total_known_debt_amount"),
    total_known_debt_confidence: strField("total_known_debt_confidence"),
    debt_statement_availability: strField("debt_statement_availability"),
    title_claims_known: strField("title_claims_known"),
    title_claims_details: strField("title_claims_details"),
    owner_stated_fmv: numField("owner_stated_fmv"),
    owner_stated_fmv_confidence: strField("owner_stated_fmv_confidence"),
    owner_stated_fmv_source: strField("owner_stated_fmv_source"),
    owner_stated_fmv_source_other: strField("owner_stated_fmv_source_other"),
    willing_to_proceed_formal_review: strField("willing_to_proceed_formal_review"),
  };

  for (const [k, v] of Object.entries(intakeFields)) {
    if (v !== null) updatePayload[k] = v;
  }

  const { error: updateErr } = await (svc.from("properties") as any)
    .update(updatePayload)
    .eq("id", propertyId)
    .or(
      `owner_user_id.eq.${user.id},created_by_user_id.eq.${user.id},claimed_by_user_id.eq.${user.id}`,
    );

  if (updateErr) return jsonError(updateErr.message, 500);

  // Process verification doc re-uploads (selfie, drivers_license, utility_bill)
  for (const docType of ALLOWED_DOC_TYPES) {
    const file = formData.get(docType);
    if (!file || !(file instanceof File) || file.size === 0) continue;

    const rawBuf = Buffer.from(await file.arrayBuffer());

    const result = await enforceLimitsAndProcess(rawBuf, file.type);
    if (!result.ok) {
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
      return jsonError(`Upload failed for ${docType}: ${uploadErr.message}`, 500);
    }

    const upsertRow: Record<string, any> = {
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

    const { error: upsertErr } = await (svc.from("property_documents") as any).upsert(
      upsertRow,
      { onConflict: "property_id,doc_type" },
    );

    if (upsertErr) {
      return jsonError(`Document record failed for ${docType}: ${upsertErr.message}`, 500);
    }
  }

  // Process secured debt statement re-uploads (appended, not upserted)
  const debtStatementFile = formData.get("secured_debt_statement");
  if (debtStatementFile instanceof File && debtStatementFile.size > 0) {
    const rawBuf = Buffer.from(await debtStatementFile.arrayBuffer());
    const result = await enforceLimitsAndProcess(rawBuf, debtStatementFile.type);

    if (!result.ok) {
      return jsonError(`Loan statement: ${result.error}`, result.status);
    }

    const storagePath = `${user.id}/${propertyId}/secured_debt_statement_${Date.now()}.${result.ext}`;

    const { error: uploadErr } = await svc.storage
      .from(BUCKET)
      .upload(storagePath, result.outBuf, {
        contentType: result.storedContentType,
        upsert: false,
      });

    if (uploadErr) {
      return jsonError(`Loan statement upload failed: ${uploadErr.message}`, 500);
    }

    const { error: insertErr } = await (svc.from("property_documents") as any).insert({
      property_id: propertyId,
      doc_type: "secured_debt_statement",
      storage_path: storagePath,
      content_type: result.storedContentType,
      byte_size: result.meta.byte_size,
      sha256: result.meta.sha256,
      width: result.meta.width ?? null,
      height: result.meta.height ?? null,
      original_content_type: result.meta.original_content_type,
    });

    if (insertErr) {
      return jsonError(`Debt document record failed: ${insertErr.message}`, 500);
    }

    console.info("PROPERTY_DEBT_DOC_UPLOAD", {
      property_id: propertyId,
      doc_type: "secured_debt_statement",
    });
  }

  // Process supporting document uploads (upsert by property_id,doc_type)
  for (const docType of SUPPORTING_DOC_TYPES) {
    const file = formData.get(docType);
    if (!file || !(file instanceof File) || file.size === 0) continue;

    const rawBuf = Buffer.from(await file.arrayBuffer());
    const result = await enforceLimitsAndProcess(rawBuf, file.type);

    if (!result.ok) {
      return jsonError(
        `${docType.replace(/_/g, " ")}: ${result.error}`,
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
      return jsonError(
        `Upload failed for ${docType.replace(/_/g, " ")}: ${uploadErr.message}`,
        500,
      );
    }

    const { error: upsertErr } = await (svc.from("property_documents") as any).upsert(
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

    if (upsertErr) {
      return jsonError(
        `Document record failed for ${docType.replace(/_/g, " ")}: ${upsertErr.message}`,
        500,
      );
    }

    console.info("PROPERTY_SUPPORTING_DOC_UPLOAD", {
      property_id: propertyId,
      doc_type: docType,
      ...result.meta,
    });
  }

  return NextResponse.json({ ok: true });
}
