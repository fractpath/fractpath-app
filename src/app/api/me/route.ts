import { NextResponse } from "next/server";
import { createSupabaseRouteClient } from "@/app/lib/supabaseRoute";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function copySetCookie(from: Response, to: Response) {
  const sc = from.headers.get("set-cookie");
  if (sc) to.headers.set("set-cookie", sc);
}

export async function GET(request: Request) {
  const carrier = NextResponse.next();

  try {
    const supabase = await createSupabaseRouteClient(request, carrier);
    const { data, error } = await supabase.auth.getUser();

    if (error || !data?.user) {
      const res = NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
      copySetCookie(carrier, res);
      return res;
    }

    const userMetadata = data.user.user_metadata || {};

    const res = NextResponse.json({
      ok: true,
      user_id: data.user.id,
      email: data.user.email ?? null,
      role: userMetadata.role ?? null,
      source: userMetadata.source ?? null,
      created_at: data.user.created_at ?? null,
      user_metadata: userMetadata,
    }, { status: 200 });
    copySetCookie(carrier, res);
    return res;

  } catch (e: any) {
    const res = NextResponse.json({ ok: false, error: e?.message ? e.message : String(e) }, { status: 500 });
    copySetCookie(carrier, res);
    return res;
  }
}
