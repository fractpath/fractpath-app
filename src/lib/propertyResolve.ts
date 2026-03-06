import "server-only";

export type ResolvedProperty = {
  property_id: string;
  normalized_address: string;
  created: boolean;
};

export function normalizeAddress(raw: string): string {
  return raw.trim().toLowerCase().replace(/[,.]/g, "").replace(/\s+/g, " ");
}

export type StructuredAddress = {
  address_line1: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
};

export async function getOrCreatePropertyByAddress(
  svc: any,
  inputAddress: string,
  createdByUserId: string,
  structured?: StructuredAddress | null,
  opts?: { setOwner?: boolean },
): Promise<ResolvedProperty> {
  let normalized: string;
  if (
    structured &&
    structured.address_line1
  ) {
    const parts = [
      structured.address_line1,
      structured.city,
      structured.state,
      structured.postal_code,
    ].filter(Boolean).join(", ");
    normalized = normalizeAddress(parts);
  } else {
    normalized = normalizeAddress(inputAddress);
  }
  if (!normalized) throw new Error("Address is empty after normalization");

  const { data: existing, error: selErr } = await (
    svc.from("properties") as any
  )
    .select("id, normalized_address")
    .eq("normalized_address", normalized)
    .maybeSingle();

  if (selErr) {
    throw new Error(`Property lookup failed: ${selErr.message}`);
  }

  const now = new Date().toISOString();

  if (existing) {
    const { error: updErr } = await (svc.from("properties") as any)
      .update({ last_activity_at: now })
      .eq("id", existing.id);

    if (updErr) {
      throw new Error(`Property touch failed: ${updErr.message}`);
    }

    return {
      property_id: existing.id,
      normalized_address: existing.normalized_address ?? normalized,
      created: false,
    };
  }

  const shouldSetOwner = opts?.setOwner !== false;

  const insertRow: Record<string, any> = {
    owner_user_id: shouldSetOwner ? createdByUserId : null,
    address_line1: structured?.address_line1 || inputAddress.trim(),
    city: structured?.city || null,
    state: structured?.state || null,
    postal_code: structured?.postal_code || null,
    status: "unverified",
    is_private: true,
    ownership_status: "unclaimed",
    created_by_user_id: createdByUserId,
    last_activity_at: now,
    normalized_address: normalized,
  };

  const { data: inserted, error: insertErr } = await (
    svc.from("properties") as any
  )
    .insert(insertRow)
    .select("id, normalized_address")
    .single();

  if (insertErr) {
    // race on unique normalized_address
    if (
      insertErr.code === "23505" ||
      (insertErr.message &&
        insertErr.message.toLowerCase().includes("duplicate"))
    ) {
      const { data: raceWinner, error: raceErr } = await (
        svc.from("properties") as any
      )
        .select("id, normalized_address")
        .eq("normalized_address", normalized)
        .maybeSingle();

      if (raceErr) {
        throw new Error(`Race reselect failed: ${raceErr.message}`);
      }

      if (raceWinner) {
        const { error: updErr } = await (svc.from("properties") as any)
          .update({ last_activity_at: now })
          .eq("id", raceWinner.id);

        if (updErr) throw new Error(`Property touch failed: ${updErr.message}`);

        return {
          property_id: raceWinner.id,
          normalized_address: raceWinner.normalized_address ?? normalized,
          created: false,
        };
      }
    }

    throw new Error(`Property insert failed: ${insertErr.message}`);
  }

  return {
    property_id: inserted.id,
    normalized_address: inserted.normalized_address ?? normalized,
    created: true,
  };
}
