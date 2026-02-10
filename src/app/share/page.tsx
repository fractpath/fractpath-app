// src/app/share/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

function firstParam(v: string | string[] | undefined): string | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function friendlyTokenError(message: string) {
  const m = (message || "").toLowerCase();

  if (m.includes("expired")) return "This share link has expired.";
  if (m.includes("max") || m.includes("redemption"))
    return "This share link has already been used.";
  if (m.includes("not found") || m.includes("invalid") || m.includes("token"))
    return "This share link is invalid.";

  return "We couldn’t open that share link. It may be invalid or already used.";
}

export default async function SharePage({ searchParams }: PageProps) {
  const t = firstParam(searchParams?.t);

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

  /**
   * 1) Redeem token using ADMIN client (incognito-safe, no session required)
   * This should return the deal UUID.
   */
  let dealId: string | null = null;
  try {
    const admin = createAdminClient();
    const redeemed = await admin.rpc("redeem_deal_share_token", { p_token: t });
    if (redeemed.error || !redeemed.data) {
      const msg = friendlyTokenError(redeemed.error?.message ?? "");
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
    dealId = redeemed.data as string;
  } catch {
    return (
      <main className="mx-auto max-w-xl p-6">
        <h1 className="text-lg font-semibold">Unable to open shared deal</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Server misconfigured. Missing service role key.
        </p>
      </main>
    );
  }

  /**
   * 2) OPTIONAL: if recipient is logged in, we can show role info.
   * If not logged in, we still show read-only view.
   */
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // If logged in, redirect to canonical deal route in shared mode
  // (so they can see role banner + share card gating etc).
  if (user) {
    redirect(`/deal/${dealId}?mode=shared`);
  }

  /**
   * 3) Incognito read-only view (minimal Share MVP)
   * Keep this simple and investor-demo safe.
   */
  const admin = createAdminClient();
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
          You can view this deal, but you can’t make changes. To collaborate,
          sign in and ask the owner to share it with your account.
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
          href={`/login?returnTo=${encodeURIComponent(`/deal/${deal.id}?mode=shared`)}`}
        >
          Sign in to view in your account
        </Link>
      </div>
    </main>
  );
}
