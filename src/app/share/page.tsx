// src/app/share/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type SearchParams = Record<string, string | string[] | undefined>;

type PageProps = {
  searchParams?: SearchParams | Promise<SearchParams>;
};

function firstParam(v: string | string[] | undefined): string | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function isLikelyExpired(row: Record<string, any>): boolean {
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

  const tokenRes = await admin
    .from("deal_share_tokens")
    .select("*")
    .eq("token", t)
    .maybeSingle();

  if (tokenRes.error || !tokenRes.data) {
    return (
      <main className="mx-auto max-w-xl p-6">
        <h1 className="text-lg font-semibold">Unable to open shared deal</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This share link is invalid or has expired.
        </p>
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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
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
            href={`/login?returnTo=${encodeURIComponent(`/share?t=${t}`)}`}
          >
            Sign in
          </Link>
          <Link
            className="rounded-md border px-4 py-2 text-sm"
            href={`/signup?returnTo=${encodeURIComponent(`/share?t=${t}`)}`}
          >
            Create an account
          </Link>
        </div>
      </main>
    );
  }

  const { data: existingGrant } = await admin
    .from("deal_access_grants")
    .select("id, role")
    .eq("deal_id", dealId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!existingGrant) {
    const { error: grantError } = await admin
      .from("deal_access_grants")
      .insert({
        deal_id: dealId,
        user_id: user.id,
        role: "VIEWER",
        created_by: tokenRow.created_by,
      });

    if (grantError) {
      return (
        <main className="mx-auto max-w-xl p-6">
          <h1 className="text-lg font-semibold">Unable to open shared deal</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            We couldn&apos;t grant access to this deal. Please try again or ask
            the deal owner to resend the share link.
          </p>
        </main>
      );
    }
  }

  redirect(`/deal/${dealId}?mode=shared`);
}
