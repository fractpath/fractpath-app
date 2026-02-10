// src/app/share/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";

type SearchParams = Record<string, string | string[] | undefined>;

type PageProps = {
  // Normalize at runtime (prod sometimes delivers promise-like objects)
  searchParams?: SearchParams | Promise<SearchParams>;
};

function firstParam(v: string | string[] | undefined): string | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function friendlyTokenError(message: string) {
  const m = (message || "").toLowerCase();

  if (m.includes("expired")) return "This share link has expired.";
  if (m.includes("not found") || m.includes("invalid") || m.includes("token"))
    return "This share link is invalid.";

  return "We couldn’t open that share link. It may be invalid.";
}

function isLikelyExpired(row: Record<string, any>): boolean {
  // Optional columns; only enforce if present
  const now = Date.now();

  const expiresAt = row.expires_at ? Date.parse(row.expires_at) : NaN;
  if (!Number.isNaN(expiresAt) && now > expiresAt) return true;

  if (row.revoked_at) return true;

  return false;
}

export default async function SharePage({ searchParams }: PageProps) {
  const sp = await Promise.resolve(searchParams as any);
  const t = firstParam(sp?.t);

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

  const admin = createAdminClient();

  /**
   * 1) Resolve token → deal_id without consuming it
   */
  const tokenRes = await admin
    .from("deal_share_tokens")
    .select("*")
    .eq("token", t)
    .maybeSingle();

  if (tokenRes.error || !tokenRes.data) {
    const msg = friendlyTokenError(tokenRes.error?.message ?? "");
    return (
      <main className="mx-auto max-w-xl p-6">
        <h1 className="text-lg font-semibold">Unable to open shared deal</h1>
        <p className="mt-2 text-sm text-muted-foreground">{msg}</p>
        <p className="mt-4 text-sm">
          If you believe this is a mistake, ask the deal owner to send a new
          share link.
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

  if (isLikelyExpired(tokenRow)) {
    return (
      <main className="mx-auto max-w-xl p-6">
        <h1 className="text-lg font-semibold">Unable to open shared deal</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This share link has expired.
        </p>
        <p className="mt-4 text-sm">
          Ask the deal owner to send a new share link.
        </p>
      </main>
    );
  }

  const dealId = String(tokenRow.deal_id);

  /**
   * 2) Load deal via ADMIN client (incognito-safe, read-only)
   */
  const dealRes = await admin
    .from("deals")
    .select("id, property_address, created_at, status")
    .eq("id", dealId)
    .maybeSingle();

  if (dealRes.error || !dealRes.data) {
    return (
      <main className="mx-auto max-w-xl p-6">
        <h1 className="text-lg font-semibold">Unable to open shared deal</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The deal could not be loaded.
        </p>
      </main>
    );
  }

  const deal = dealRes.data;

  return (
    <main className="mx-auto max-w-3xl p-6">
      <div className="mb-4 rounded-md border p-3">
        <div className="text-sm font-medium">Read-only shared deal</div>
        <div className="mt-1 text-sm text-muted-foreground">
          You can view this deal, but you can’t make changes.
        </div>
      </div>

      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-xl font-semibold">Deal</h1>
        <div className="text-sm text-muted-foreground">
          Status:{" "}
          <span className="font-medium text-foreground">{deal.status}</span>
        </div>
      </div>

      <div className="mt-4 rounded-md border p-4 text-sm">
        <div className="grid gap-2">
          <div>
            <span className="font-medium">Deal ID:</span>{" "}
            <span className="break-words">{deal.id}</span>
          </div>
          <div>
            <span className="font-medium">Property:</span>{" "}
            <span className="break-words">{deal.property_address}</span>
          </div>
          <div>
            <span className="font-medium">Created:</span>{" "}
            <span className="break-words">{deal.created_at}</span>
          </div>
        </div>
      </div>

      <div className="mt-6 flex gap-4">
        <Link
          className="text-sm underline"
          href={`/login?returnTo=${encodeURIComponent(`/share?t=${t}`)}`}
        >
          Sign in
        </Link>
        <Link className="text-sm underline" href="/signup">
          Create an account
        </Link>
      </div>
    </main>
  );
}
