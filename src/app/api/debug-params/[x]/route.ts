import { NextResponse } from "next/server";

export async function GET(_req: Request, ctx: any) {
  const p = ctx?.params;
  const isPromise =
    !!p &&
    (typeof p === "object" || typeof p === "function") &&
    typeof (p as any).then === "function";

  const params = isPromise ? await p : p;

  return NextResponse.json({
    isPromise,
    params,
  });
}
