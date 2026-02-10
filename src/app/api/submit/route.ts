import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

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

  // Require auth (same rule as /api/scenario)
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = IntakeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid input." }, { status: 400 });
  }

  // Use the SECURITY DEFINER function to create BOTH deal + OWNER grant
  const propertyAddress = parsed.data.homeAddress.trim();

  const { data: dealId, error } = await supabase.rpc(
    "create_deal_with_owner_grant",
    {
      p_property_address: propertyAddress,
      p_user_id: user.id,
    },
  );

  if (error || !dealId) {
    return NextResponse.json(
      { ok: false, error: error?.message ?? "Failed to create deal." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, dealId }, { status: 201 });
}
