import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getOrCreatePropertyByAddress } from "@/lib/propertyResolve";

export const runtime = "nodejs";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

async function resolveAddressFromPlaceId(placeId: string): Promise<string | null> {
  const apiKey = process.env.GEOAPIFY_API_KEY;
  if (!apiKey) return null;

  try {
    const url = new URL("https://api.geoapify.com/v2/place-details");
    url.searchParams.set("id", placeId);
    url.searchParams.set("apiKey", apiKey);

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;

    const data = await res.json();
    const props = data?.features?.[0]?.properties;
    return props?.formatted ?? null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return jsonError("Unauthorized", 401);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body");
  }

  let address = typeof body?.address === "string" ? body.address.trim() : "";
  const placeId = typeof body?.place_id === "string" ? body.place_id.trim() : "";

  if (!address && placeId) {
    const resolved = await resolveAddressFromPlaceId(placeId);
    if (resolved) {
      address = resolved;
    } else {
      return jsonError("Could not resolve place_id to an address", 422);
    }
  }

  if (!address) return jsonError("address or place_id is required", 422);

  try {
    const svc = createServiceClient();
    const result = await getOrCreatePropertyByAddress(svc, address, user.id);

    const { data: prop } = await (svc.from("properties") as any)
      .select("status, ownership_status, claimed_by_user_id")
      .eq("id", result.property_id)
      .maybeSingle();

    return NextResponse.json({
      ok: true,
      property_id: result.property_id,
      display_address: address,
      normalized_address: result.normalized_address,
      property_status: prop?.status ?? null,
      ownership_status: prop?.ownership_status ?? null,
      claimed_by_user_id: prop?.claimed_by_user_id ?? null,
    });
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    const code = err?.code ?? err?.cause?.code;
    console.error("property_resolve_error", err);
    return NextResponse.json({ ok: false, error: msg, code }, { status: 500 });
  }
}
