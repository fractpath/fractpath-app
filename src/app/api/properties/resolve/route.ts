import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getOrCreatePropertyByAddress } from "@/lib/propertyResolve";

export const runtime = "nodejs";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
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

  const address = typeof body?.address === "string" ? body.address.trim() : "";
  if (!address) return jsonError("address is required", 422);

  try {
    const svc = createServiceClient();
    const result = await getOrCreatePropertyByAddress(svc, address, user.id);

    return NextResponse.json({
      ok: true,
      property_id: result.property_id,
      normalized_address: result.normalized_address,
    });
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    const code = err?.code ?? err?.cause?.code;
    console.error("property_resolve_error", err);
    return NextResponse.json({ ok: false, error: msg, code }, { status: 500 });
  }
}
