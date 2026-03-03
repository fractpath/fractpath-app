import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return jsonError("Unauthorized", 401);

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 4) {
    return NextResponse.json({ ok: true, suggestions: [] });
  }

  const apiKey = process.env.GEOAPIFY_API_KEY;
  if (!apiKey) {
    return jsonError("Server misconfigured: missing GEOAPIFY_API_KEY", 500);
  }

  try {
    const url = new URL("https://api.geoapify.com/v1/geocode/autocomplete");
    url.searchParams.set("text", q);
    url.searchParams.set("apiKey", apiKey);
    url.searchParams.set("limit", "6");
    url.searchParams.set("type", "amenity");
    url.searchParams.set("format", "json");
    url.searchParams.set("filter", "countrycode:us");

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(5000) });

    if (!res.ok) {
      console.error("geoapify_autocomplete_error", res.status, await res.text().catch(() => ""));
      return jsonError("Geocoding service error", 502);
    }

    const data = await res.json();
    const results = data.results ?? [];

    const suggestions = results.slice(0, 6).map((r: any) => ({
      label: r.formatted ?? "",
      place_id: r.place_id ?? "",
    }));

    return NextResponse.json({ ok: true, suggestions });
  } catch (err: any) {
    console.error("geoapify_autocomplete_exception", err?.message);
    return jsonError("Geocoding service unavailable", 502);
  }
}
