import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function jsonError(msg: string, status: number) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError("Unauthorized", 401);

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error) return jsonError(error.message, 500);

  return NextResponse.json({ ok: true, profile: data });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError("Unauthorized", 401);

  const body = await req.json().catch(() => null);
  if (!body) return jsonError("Invalid JSON", 400);

  const firstName = String(body.first_name ?? "").trim();
  const lastName = String(body.last_name ?? "").trim();
  const nickname = String(body.nickname ?? "").trim();

  if (!firstName) return jsonError("First name is required", 422);
  if (!lastName) return jsonError("Last name is required", 422);
  if (!nickname) return jsonError("Nickname is required", 422);

  const phone = body.phone != null ? String(body.phone).trim() || null : null;
  const marketingOptIn = body.marketing_opt_in !== false;
  const smsConsent = body.sms_consent === true;

  const { data: existing } = await supabase
    .from("profiles")
    .select("sms_consent")
    .eq("id", user.id)
    .maybeSingle();

  const smsConsentAt =
    smsConsent && (!existing || existing.sms_consent === false)
      ? new Date().toISOString()
      : undefined;

  const row: Record<string, unknown> = {
    id: user.id,
    first_name: firstName,
    last_name: lastName,
    nickname,
    phone,
    marketing_opt_in: marketingOptIn,
    sms_consent: smsConsent,
  };
  if (smsConsentAt) row.sms_consent_at = smsConsentAt;

  const { data, error } = await supabase
    .from("profiles")
    .upsert(row, { onConflict: "id" })
    .select()
    .single();

  if (error) return jsonError(error.message, 500);

  return NextResponse.json({ ok: true, profile: data });
}
