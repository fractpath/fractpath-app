import { NextResponse } from "next/server";

export async function GET(_req: Request, ctx: any) {
  const p = ctx?.params;
  const isPromise =
    !!p &&
    (typeof p === "object" || typeof p === "function") &&
    typeof p.then === "function";

  return NextResponse.json({
    typeofParams: typeof p,
    isPromise,
    params: p,
  });
}
