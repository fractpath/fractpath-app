-- Sprint 12 / Phase 1 — Property Identity (v2)
-- Align with current properties schema (structured address + is_private)

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS normalized_address text;

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS ownership_status text NOT NULL DEFAULT 'unclaimed';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_properties_ownership_status'
      AND conrelid = 'public.properties'::regclass
  ) THEN
    ALTER TABLE public.properties
      ADD CONSTRAINT chk_properties_ownership_status
      CHECK (ownership_status IN ('unclaimed', 'claimed', 'verified'));
  END IF;
END$$;

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid REFERENCES auth.users(id);

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS claimed_by_user_id uuid REFERENCES auth.users(id);

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS idx_properties_normalized_address
  ON public.properties (normalized_address)
  WHERE normalized_address IS NOT NULL;

COMMIT;
SQL

Verify file exists:

ls -la supabase/migrations/20260301_property_identity_resolve_v2.sql
C) Replace src/lib/propertyResolve.ts (full overwrite)
cat > src/lib/propertyResolve.ts <<'TS'
import "server-only";

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
  if (!normalized) throw new Error("Address is empty after normalization");

  const { data: existing, error: selErr } = await (svc.from("properties") as any)
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

    if (updErr) throw new Error(`Property touch failed: ${updErr.message}`);

    return {
      property_id: existing.id,
      normalized_address: existing.normalized_address ?? normalized,
      created: false,
    };
  }

  const { data: inserted, error: insertErr } = await (svc.from("properties") as any)
    .insert({
      owner_user_id: createdByUserId,
      // beta: store as line1 only; structured parsing can be added later
      address_line1: inputAddress.trim(),
      status: "unverified",
      is_private: true,
      ownership_status: "unclaimed",
      created_by_user_id: createdByUserId,
      last_activity_at: now,
      normalized_address: normalized,
    })
    .select("id, normalized_address")
    .single();

  if (insertErr) {
    if (
      insertErr.code === "23505" ||
      (insertErr.message && insertErr.message.toLowerCase().includes("duplicate"))
    ) {
      const { data: raceWinner, error: raceErr } = await (svc.from("properties") as any)
        .select("id, normalized_address")
        .eq("normalized_address", normalized)
        .maybeSingle();

      if (raceErr) throw new Error(`Race reselect failed: ${raceErr.message}`);

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