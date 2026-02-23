import { NextResponse } from "next/server";

/**
 * Marketing-style homepage submission endpoint.
 *
 * In the App repo we keep it minimal; auth-gated behavior is allowed.
 * Contract tests primarily require that this route exists at the App Router path.
 */
export async function POST(req: Request) {
  // If you later want this to be public, change this contract consciously.
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

// Explicitly disallow GET to avoid accidental crawling
export async function GET() {
  return NextResponse.json({ ok: false, error: "Method Not Allowed" }, { status: 405 });
}
