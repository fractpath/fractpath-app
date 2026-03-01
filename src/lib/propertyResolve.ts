import "server-only";

/**
 * Sprint 12 — Property Identity: get-or-create by address.
 *
 * Normalization is intentionally simple for beta:
 *   trim → lowercase → collapse whitespace → strip commas/periods
 *
 * Two users entering the same address converge to the same property
 * record via a partial unique index on normalized_address. The endpoint
 * returns only the property_id and normalized_address — no owner info,
 * no sensitive data. Further access to property details is gated by
 * existing RLS (owner_user_id = auth.uid()).
 */

export type ResolvedProperty = {
  property_id: string;
  normalized_address: string;
  created: boolean;
};

export function normalizeAddress(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[,.]/g, "")
    .replace(/\s+/g, " ");
}

export async function getOrCreatePropertyByAddress(
  svc: any,
  inputAddress: string,
  createdByUserId: string,
): Promise<ResolvedProperty> {
  const normalized = normalizeAddress(inputAddress);

  if (!normalized) {
    throw new Error("Address is empty after normalization");
  }

  const { data: existing } = await (svc.from("properties") as any)
    .select("id, normalized_address")
    .eq("normalized_address", normalized)
    .maybeSingle();

  if (existing) {
    await (svc.from("properties") as any)
      .update({ last_activity_at: new Date().toISOString() })
      .eq("id", existing.id);

    return {
      property_id: existing.id,
      normalized_address: existing.normalized_address,
      created: false,
    };
  }

  const now = new Date().toISOString();

  const { data: inserted, error: insertErr } = await (
    svc.from("properties") as any
  )
    .insert({
      owner_user_id: createdByUserId,
      address: inputAddress.trim(),
      normalized_address: normalized,
      status: "unverified",
      visibility: "private",
      ownership_status: "unclaimed",
      created_by_user_id: createdByUserId,
      last_activity_at: now,
    })
    .select("id, normalized_address")
    .single();

  if (insertErr) {
    if (
      insertErr.code === "23505" ||
      (insertErr.message && insertErr.message.includes("duplicate"))
    ) {
      const { data: raceWinner } = await (svc.from("properties") as any)
        .select("id, normalized_address")
        .eq("normalized_address", normalized)
        .maybeSingle();

      if (raceWinner) {
        await (svc.from("properties") as any)
          .update({ last_activity_at: now })
          .eq("id", raceWinner.id);

        return {
          property_id: raceWinner.id,
          normalized_address: raceWinner.normalized_address,
          created: false,
        };
      }
    }

    throw new Error(`Property insert failed: ${insertErr.message}`);
  }

  return {
    property_id: inserted.id,
    normalized_address: inserted.normalized_address,
    created: true,
  };
}
