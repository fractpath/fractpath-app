// src/app/share/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

type SearchParams = Record<string, string | string[] | undefined>;

type PageProps = {
  searchParams?: SearchParams | Promise<SearchParams>;
};

function firstParam(v: string | string[] | undefined): string | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function isExpired(row: Record<string, any>): boolean {
  const now = Date.now();
  const expiresAt = row.expires_at ? Date.parse(row.expires_at) : NaN;
  if (!Number.isNaN(expiresAt) && now > expiresAt) return true;
  return false;
}

function safeErr(e: any) {
  if (!e) return null;
  return {
    message: typeof e.message === "string" ? e.message : undefined,
    details: typeof e.details === "string" ? e.details : undefined,
    hint: typeof e.hint === "string" ? e.hint : undefined,
    code: typeof e.code === "string" ? e.code : undefined,
    raw: (() => {
      try {
        return JSON.parse(JSON.stringify(e));
      } catch {
        return String(e);
      }
    })(),
  };
}

export default async function SharePage({ searchParams }: PageProps) {
  const sp = await Promise.resolve(searchParams as any);
  const t = firstParam(sp?.t);
  const mode = firstParam(sp?.mode);

  if (!t) {
    return (
      <main className="mx-auto max-w-xl p-6">
        <h1 className="text-lg font-semibold">Share link</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Missing share token. Please use the link from your email.
        </p>
      </main>
    );
  }

  const service = createServiceClient();

  // Service-role sanity check: draft_tokens is RLS deny-all for client roles.
  const sanity = await (service.from("draft_tokens") as any)
    .select("id")
    .limit(1);

  if (sanity.error) {
    const se = safeErr(sanity.error);
    console.error("SERVICE_SANITY_CHECK_FAILED draft_tokens select:", se);
    return (
      <main className="mx-auto max-w-xl p-6">
        <h1 className="text-lg font-semibold">Unable to open shared deal</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Server is not authorized to validate share tokens (service role
          misconfigured).
        </p>
        <div className="mt-4 rounded-md border p-3 text-xs">
          <div className="font-medium">Details</div>
          <pre className="mt-2 whitespace-pre-wrap break-words">
            {JSON.stringify(se, null, 2)}
          </pre>
        </div>
      </main>
    );
  }

  // 1) Validate share token row (service role read)
  const tokenRes = await (service.from("deal_share_tokens") as any)
    .select(
      "token, deal_id, created_by, created_at, expires_at, max_redemptions, redemption_count",
    )
    .eq("token", t)
    .maybeSingle();

  if (tokenRes.error || !tokenRes.data) {
    const te = safeErr(tokenRes.error);
    if (tokenRes.error) console.error("deal_share_tokens select error:", te);
    return (
      <main className="mx-auto max-w-xl p-6">
        <h1 className="text-lg font-semibold">Unable to open shared deal</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This share link is invalid or has expired.
        </p>
      </main>
    );
  }

  const tokenRow = tokenRes.data as Record<string, any>;

  if (!tokenRow.deal_id) {
    return (
      <main className="mx-auto max-w-xl p-6">
        <h1 className="text-lg font-semibold">Unable to open shared deal</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This share link is invalid.
        </p>
      </main>
    );
  }

  if (isExpired(tokenRow)) {
    return (
      <main className="mx-auto max-w-xl p-6">
        <h1 className="text-lg font-semibold">Unable to open shared deal</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This share link has expired.
        </p>
      </main>
    );
  }

  const max =
    typeof tokenRow.max_redemptions === "number"
      ? tokenRow.max_redemptions
      : null;
  const used =
    typeof tokenRow.redemption_count === "number"
      ? tokenRow.redemption_count
      : 0;

  if (max != null && used >= max) {
    return (
      <main className="mx-auto max-w-xl p-6">
        <h1 className="text-lg font-semibold">Unable to open shared deal</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This share link has already been used.
        </p>
      </main>
    );
  }

  const dealId = String(tokenRow.deal_id);

  // 2) Require auth (normal client)
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const returnTo = `/share?t=${encodeURIComponent(t)}${
      mode ? `&mode=${encodeURIComponent(mode)}` : ""
    }`;
    return (
      <main className="mx-auto max-w-xl p-6">
        <div className="mb-4 rounded-md border p-3">
          <div className="text-sm font-medium">Read-only shared deal</div>
          <div className="mt-1 text-sm text-muted-foreground">
            Sign in or create an account to view this deal.
          </div>
        </div>

        <div className="mt-6 flex gap-4">
          <Link
            className="rounded-md border px-4 py-2 text-sm"
            href={`/login?returnTo=${encodeURIComponent(returnTo)}`}
          >
            Sign in
          </Link>
          <Link
            className="rounded-md border px-4 py-2 text-sm"
            href={`/signup?returnTo=${encodeURIComponent(returnTo)}`}
          >
            Create an account
          </Link>
        </div>
      </main>
    );
  }

  // 3) Ensure deal exists (service read)
  const dealRes = await (service.from("deals") as any)
    .select("id, owner_user_id")
    .eq("id", dealId)
    .maybeSingle();

  if (dealRes.error || !dealRes.data) {
    const de = safeErr(dealRes.error);
    if (dealRes.error) console.error("deals select error:", de);
    return (
      <main className="mx-auto max-w-xl p-6">
        <h1 className="text-lg font-semibold">Unable to open shared deal</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This deal no longer exists.
        </p>
      </main>
    );
  }

  // 4) Redeem token via canonical RPC (authenticated)
  const redeem = await supabase.rpc("redeem_deal_share_token_v2", { p_token: t });

  if (redeem.error) {
    const re = safeErr(redeem.error);
    console.error("redeem_deal_share_token error:", re);
    return (
      <main className="mx-auto max-w-xl p-6">
        <h1 className="text-lg font-semibold">Unable to open shared deal</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We couldn&apos;t redeem this share link. Please ask the deal owner to
          resend it.
        </p>
        <div className="mt-4 rounded-md border p-3 text-xs">
          <div className="font-medium">Details</div>
          <pre className="mt-2 whitespace-pre-wrap break-words">
            {JSON.stringify(re, null, 2)}
          </pre>
        </div>
      </main>
    );
  }

  redirect(`/deal/${dealId}?mode=shared`);
}
