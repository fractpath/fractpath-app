import { createAdminClient } from "@/lib/supabase/admin";
import { fetchMashvisorProperty } from "./client";
import { normalizeMashvisorResponse, type MashvisorNormalizedSummary } from "./types";

type RunMashvisorEnrichmentInput = {
  propertyId: string;
  requestedBy: string;
};

export type MashvisorEnrichmentResult = {
  runId: string;
  summary: MashvisorNormalizedSummary;
};

export async function runMashvisorEnrichment(
  input: RunMashvisorEnrichmentInput,
): Promise<MashvisorEnrichmentResult> {
  const { propertyId, requestedBy } = input;
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
      "Property does not have enough address data to fetch enrichment (address, city, state required).",
    );
  }

  const now = new Date().toISOString();

  const { data: runRow, error: runErr } = await (supabase.from("property_review_runs") as any)
    .insert({
      property_id: propertyId,
      provider: "mashvisor",
      artifact_type: "mashvisor_enrichment",
      status: "pending",
      requested_by: requestedBy,
      requested_at: now,
      request_params: {
        address: p.address_line1,
        city: p.city,
        state: p.state,
        zip_code: p.postal_code ?? undefined,
      },
      is_current: false,
    })
    .select("id")
    .single();

  if (runErr || !runRow) {
    throw new Error(`Failed to create run record: ${runErr?.message ?? "unknown"}`);
  }

  const runId = (runRow as { id: string }).id;

  let rawPayload: unknown;
  let summary: MashvisorNormalizedSummary;

  try {
    rawPayload = await fetchMashvisorProperty({
      address: p.address_line1,
      city: p.city,
      state: p.state,
      zip_code: p.postal_code ?? undefined,
    });
    summary = normalizeMashvisorResponse(rawPayload);
  } catch (fetchErr) {
    const msg = fetchErr instanceof Error ? fetchErr.message : "Mashvisor fetch failed";
    await (supabase.from("property_review_runs") as any)
      .update({ status: "failed", error_message: msg, completed_at: new Date().toISOString() })
      .eq("id", runId);
    throw new Error(msg);
  }

  await (supabase.from("property_review_runs") as any)
    .update({
      status: "completed",
      completed_at: summary.fetched_at,
      raw_payload: rawPayload,
      normalized_payload: summary,
      is_current: true,
    })
    .eq("id", runId);

  await (supabase.from("property_review_runs") as any)
    .update({ is_current: false })
    .eq("property_id", propertyId)
    .eq("artifact_type", "mashvisor_enrichment")
    .neq("id", runId);

  return { runId, summary };
}
