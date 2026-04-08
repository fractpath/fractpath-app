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

// ─── Image import constants ────────────────────────────────────────────────────

/** Public bucket for FractPath-hosted enrichment images. */
const IMAGE_BUCKET = "property-images";

/** Per-image fetch timeout (ms). Skip the image if it takes longer. */
const FETCH_TIMEOUT_MS = 8_000;

/** Maximum images to import per enrichment run. */
const MAX_IMAGES = 10;

// ─── Storage bucket bootstrap ──────────────────────────────────────────────────

async function ensureImageBucket(
  supabase: ReturnType<typeof createAdminClient>,
): Promise<void> {
  const { data } = await supabase.storage.getBucket(IMAGE_BUCKET);
  if (!data) {
    const { error } = await supabase.storage.createBucket(IMAGE_BUCKET, {
      public: true,
      fileSizeLimit: 5 * 1024 * 1024,
    });
    if (error) {
      // Non-fatal: another concurrent request may have already created it.
      console.warn(
        `[Mashvisor] Could not create bucket ${IMAGE_BUCKET}: ${error.message}`,
      );
    }
  }
}

// ─── Per-image fetch + upload ──────────────────────────────────────────────────

async function importSingleImage(
  supabase: ReturnType<typeof createAdminClient>,
  providerUrl: string,
  storagePath: string,
): Promise<{ hostedUrl: string | null; failureReason: string | null }> {
  let res: Response;
  try {
    res = await fetch(providerUrl, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "User-Agent": "FractPath-Enrichment/1.0" },
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "fetch error";
    return { hostedUrl: null, failureReason: reason };
  }

  if (!res.ok) {
    return { hostedUrl: null, failureReason: `HTTP ${res.status}` };
  }

  const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim();
  if (!contentType.startsWith("image/")) {
    return {
      hostedUrl: null,
      failureReason: `Not an image (content-type: ${contentType || "unknown"})`,
    };
  }

  let buf: Buffer;
  try {
    buf = Buffer.from(await res.arrayBuffer());
  } catch {
    return { hostedUrl: null, failureReason: "Failed to read response body" };
  }

  const { error: uploadErr } = await supabase.storage
    .from(IMAGE_BUCKET)
    .upload(storagePath, buf, { contentType, upsert: true });

  if (uploadErr) {
    return { hostedUrl: null, failureReason: `Upload: ${uploadErr.message}` };
  }

  const { data: pubData } = supabase.storage
    .from(IMAGE_BUCKET)
    .getPublicUrl(storagePath);

  return { hostedUrl: pubData.publicUrl, failureReason: null };
}

// ─── Batch image import ────────────────────────────────────────────────────────

async function importImages(
  supabase: ReturnType<typeof createAdminClient>,
  propertyId: string,
  enrichmentId: string,
  providerUrls: string[],
): Promise<{ urlMap: Map<string, string>; succeeded: number; attempted: number }> {
  const urlMap = new Map<string, string>();
  let succeeded = 0;
  const cap = Math.min(providerUrls.length, MAX_IMAGES);

  console.log(
    `[Mashvisor] Image import starting: ${cap} image(s) for property ${propertyId}`,
  );

  for (let i = 0; i < cap; i++) {
    const provUrl = providerUrls[i];

    const urlExt = provUrl.split("?")[0].split(".").pop()?.toLowerCase();
    const ext =
      urlExt && ["jpg", "jpeg", "png", "webp"].includes(urlExt)
        ? urlExt === "jpeg" ? "jpg" : urlExt
        : "jpg";

    const storagePath = `enrichments/${propertyId}/${enrichmentId}/${i}.${ext}`;
    const host = (() => {
      try { return new URL(provUrl).hostname; } catch { return provUrl.slice(0, 50); }
    })();

    const { hostedUrl, failureReason } = await importSingleImage(
      supabase,
      provUrl,
      storagePath,
    );

    if (hostedUrl) {
      urlMap.set(provUrl, hostedUrl);
      succeeded++;
      console.log(`[Mashvisor] Image ${i + 1}/${cap} OK — host: ${host}`);
    } else {
      console.warn(
        `[Mashvisor] Image ${i + 1}/${cap} FAILED — host: ${host} — reason: ${failureReason}`,
      );
    }
  }

  console.log(
    `[Mashvisor] Image import complete: ${succeeded}/${cap} succeeded for property ${propertyId}`,
  );

  return { urlMap, succeeded, attempted: cap };
}

// ─── URL rewrite ───────────────────────────────────────────────────────────────

/**
 * Rewrite a provider MashvisorImagesPayload to use FractPath-hosted URLs.
 *
 * - cover_image_url and image_urls are replaced with uploaded copies.
 * - Images whose uploads failed are dropped from both lists.
 * - Original provider URLs are preserved in provider_image_urls (debug only).
 *
 * Exported so the verification script can unit-test this pure function.
 */
export function rewriteImagesPayload(
  providerPayload: MashvisorImagesPayload,
  urlMap: Map<string, string>,
): MashvisorImagesPayload {
  const hostedImageUrls = providerPayload.image_urls
    .map((u) => urlMap.get(u))
    .filter((u): u is string => u !== undefined);

  // cover_image_url is typically the first entry in image_urls; fall back to
  // the first successfully hosted image if the cover's upload failed.
  const hostedCover = providerPayload.cover_image_url
    ? urlMap.get(providerPayload.cover_image_url) ?? hostedImageUrls[0] ?? null
    : hostedImageUrls[0] ?? null;

  return {
    cover_image_url: hostedCover,
    image_urls: hostedImageUrls,
    provider_image_urls: {
      cover: providerPayload.cover_image_url,
      gallery: providerPayload.image_urls,
    },
  };
}

// ─── Main enrichment function ──────────────────────────────────────────────────

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
  let providerImages: MashvisorImagesPayload;

  try {
    rawPayload = await fetchMashvisorProperty({
      address: p.address_line1,
      city: p.city,
      state: p.state,
      zip_code: p.postal_code ?? undefined,
    });
    summary = normalizeMashvisorResponse(rawPayload);
    providerImages = extractMashvisorImages(rawPayload);
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

  // ── Image import: download provider images server-side and re-host ────────────
  //
  // Provider Listhub URLs return AccessDenied when requested by a browser
  // (Referer-gated CDN). Server-side fetches bypass this restriction.
  // Failures are non-fatal: partial success keeps whatever images uploaded.
  let images: MashvisorImagesPayload;

  if (providerImages.image_urls.length > 0) {
    try {
      await ensureImageBucket(supabase);
      const { urlMap } = await importImages(
        supabase,
        propertyId,
        enrichmentId,
        providerImages.image_urls,
      );
      images = rewriteImagesPayload(providerImages, urlMap);
    } catch (imgErr) {
      // Non-fatal: if the whole import block throws, store empty images and
      // let the UI fallback tile render rather than failing the enrichment.
      console.error(
        `[Mashvisor] Image import block failed for property ${propertyId}:`,
        imgErr,
      );
      images = {
        cover_image_url: null,
        image_urls: [],
        provider_image_urls: {
          cover: providerImages.cover_image_url,
          gallery: providerImages.image_urls,
        },
      };
    }
  } else {
    images = providerImages;
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
