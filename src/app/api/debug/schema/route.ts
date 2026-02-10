import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET() {
  try {
    const svc = createServiceClient();

    const tablesWanted = [
      "deals",
      "deal_access_grants",
      "fractpath_scenarios",
      "draft_tokens",
    ];

    const { data, error } = await (svc as any).rpc("debug_schema_tables", {
      p_tables: tablesWanted,
    });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, tables: data ?? {} }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "unknown error" },
      { status: 500 },
    );
  }
}
