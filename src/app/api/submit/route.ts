import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const IntakeSchema = z.object({
  email: z.string().email().optional(),
  homeAddress: z.string().min(3).max(500),
  estimatedEquityPercentageOwned: z.coerce.number().min(0).max(100).optional(),
  preferredCashStructure: z
    .enum(["upfront", "installments", "both", "exploring"])
    .optional(),
  intendedSaleTimeline: z.enum(["3-12-months", "exploring"]).optional(),
});

export async function POST(req: Request) {
  const supabase = await createClient();

  // Require auth
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON." },
      { status: 400 },
    );
  }

  const parsed = IntakeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid input." },
      { status: 400 },
    );
  }

  const intake = parsed.data;

  // Canonical deal creation:
  // - deals table does NOT include property_address
  // - store intake data immutably as a DEAL_CREATED event payload
  // - create OWNER grant row
  const service = createServiceClient();

  // Create deal
  const sourceRef = `intake:${cryptoRandomId()}`;

  const dealInsert = await (service.from("deals") as any)
    .insert({
      owner_user_id: user.id,
      status: "DRAFT",
      created_from: "app_intake",
      source_ref: sourceRef,
      mode: "app",
    })
    .select("id")
    .single();

  if (dealInsert.error || !dealInsert.data?.id) {
    return NextResponse.json(
      {
        ok: false,
        error: dealInsert.error?.message ?? "Failed to create deal.",
      },
      { status: 500 },
    );
  }

  const dealId = dealInsert.data.id as string;

  // Create OWNER grant (id-less table; unique(deal_id,user_id) assumed)
  const grantInsert = await (service.from("deal_access_grants") as any).insert({
    deal_id: dealId,
    user_id: user.id,
    role: "OWNER",
    created_by: user.id,
  });

  // If grant insert fails due to unique constraint (already exists), ignore; otherwise error.
  if (grantInsert.error) {
    const msg = grantInsert.error?.message || "";
    const isUnique =
      msg.toLowerCase().includes("duplicate") ||
      msg.toLowerCase().includes("unique") ||
      msg.toLowerCase().includes("idx_deal_access_grants_deal_user");
    if (!isUnique) {
      return NextResponse.json(
        { ok: false, error: "Deal created but failed to create OWNER grant." },
        { status: 500 },
      );
    }
  }

  // Record immutable intake details as an event (append-only)
  const eventInsert = await (service.from("deal_events") as any).insert({
    deal_id: dealId,
    event_type: "DEAL_CREATED",
    payload: {
      source: "app_intake",
      source_ref: sourceRef,
      status: "DRAFT",
      intake: {
        email: intake.email ?? user.email ?? null,
        home_address: intake.homeAddress.trim(),
        estimated_equity_percentage_owned:
          intake.estimatedEquityPercentageOwned ?? null,
        preferred_cash_structure: intake.preferredCashStructure ?? null,
        intended_sale_timeline: intake.intendedSaleTimeline ?? null,
      },
    },
    created_by: user.id,
  });

  if (eventInsert.error) {
    return NextResponse.json(
      { ok: false, error: "Deal created but failed to record audit event." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, dealId }, { status: 201 });
}

// Small helper to avoid importing node crypto in edge contexts.
// This route runs in Node by default (server), but keep it dependency-light.
function cryptoRandomId() {
  // 16 chars base36-ish is fine for source_ref uniqueness (not security)
  return (
    Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 10)
  );
}
