import { createAdminClient } from "@/lib/supabase/admin";
import { fetchMashvisorProperty } from "./client";
import {
  normalizeMashvisorResponse,
  extractMashvisorImages,
  type MashvisorNormalizedSummary,
  type MashvisorImagesPayload,
} from "./types";

type RunMashvisorEnrichmentInput = {
  propertyId: string;
  requestedBy: string;
};

export type MashvisorEnrichmentResult = {
  enrichmentId: string;
  summary: MashvisorNormalizedSummary;
  images: MashvisorImagesPayload;
};

export async function runMashvisorEnrichment(
  input: RunMashvisorEnrichmentInput,
): Promise<MashvisorEnrichmentResult> {
  const { propertyId } = input;
  const supabase = createAdminClient();

  const { data: prop, error: propErr } = await supabase
    .from("properties")
    .select("id, address_line1, city, state, postal_code")
    .eq("id", propertyId)
    .single();

  if (propErr || !prop) {
    throw new Error(`Property not found: ${propErr?.message ?? "unknown"}`);
  }

  const p = prop as {
    id: string;
    address_line1: string | null;
    city: string | null;
    state: string | null;
    postal_code: string | null;
  };

  if (!p.address_line1 || !p.city || !p.state) {
    throw new Error(
      "Property does not have enough address data (address, city, state required).",
    );
  }

  const sourceAddress = {
    address: p.address_line1,
    city: p.city,
    state: p.state,
    zip_code: p.postal_code ?? null,
  };

  const now = new Date().toISOString();

  // Clear any existing current row for this property+provider before inserting new one.
  await (supabase.from("property_enrichments") as any)
    .update({ is_current: false, updated_at: now })
    .eq("property_id", propertyId)
    .eq("provider", "mashvisor")
    .eq("is_current", true);

  // Insert pending row.
  const { data: inserted, error: insertErr } = await (
    supabase.from("property_enrichments") as any
  )
    .insert({
      property_id: propertyId,
      provider: "mashvisor",
      status: "pending",
      is_current: true,
      source_address: sourceAddress,
      created_at: now,
      updated_at: now,
    })
    .select("id")
    .single();

  if (insertErr || !inserted) {
    throw new Error(`Failed to create enrichment record: ${insertErr?.message ?? "unknown"}`);
  }

  const enrichmentId = (inserted as { id: string }).id;

  let rawPayload: unknown;
  let summary: MashvisorNormalizedSummary;
  let images: MashvisorImagesPayload;

  try {
    rawPayload = await fetchMashvisorProperty({
      address: p.address_line1,
      city: p.city,
      state: p.state,
      zip_code: p.postal_code ?? undefined,
    });
    summary = normalizeMashvisorResponse(rawPayload);
    images = extractMashvisorImages(rawPayload);
  } catch (fetchErr) {
    const msg = fetchErr instanceof Error ? fetchErr.message : "Mashvisor fetch failed";
    await (supabase.from("property_enrichments") as any)
      .update({
        status: "failed",
        error_message: msg,
        updated_at: new Date().toISOString(),
      })
      .eq("id", enrichmentId);
    throw new Error(msg);
  }

  await (supabase.from("property_enrichments") as any)
    .update({
      status: "completed",
      provider_record_id: summary.mashvisor_property_id ?? null,
      raw_payload: rawPayload,
      summary_payload: summary,
      images_payload: images,
      fetched_at: summary.fetched_at,
      updated_at: summary.fetched_at,
    })
    .eq("id", enrichmentId);

  return { enrichmentId, summary, images };
}
