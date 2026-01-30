import { z } from "zod";

const IntakeSchema = z.object({
  homeAddress: z.string().min(3).max(500),

  estimatedEquityPercentageOwned: z.coerce
    .number()
    .min(0)
    .max(100),

  preferredCashStructure: z.enum([
    "upfront",
    "installments",
    "both",
    "exploring",
  ]),

  intendedSaleTimeline: z.enum([
    "3-12-months",
    "exploring",
  ]),
});

export async function POST(req: Request) {
  let body: unknown;

  try {
    body = await req.json();
  } catch {
    return Response.json(
      { ok: false, error: "Invalid JSON." },
      { status: 400 }
    );
  }

  const parsed = IntakeSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: "Invalid input." },
      { status: 400 }
    );
  }

  // Scaffold only:
  // No persistence, no integrations, no side effects.
  return Response.json({ ok: true }, { status: 200 });
}
