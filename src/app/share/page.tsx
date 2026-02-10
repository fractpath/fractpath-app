import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

function getParam(searchParams: PageProps["searchParams"], key: string): string | null {
  const v = searchParams?.[key];
  if (!v) return null;
  return Array.isArray(v) ? v[0] ?? null : v;
}

function buildReturnTo(t: string) {
  // Keep it relative to satisfy your existing "relative paths only" guard.
  const encoded = encodeURIComponent(t);
  return `/share?t=${encoded}`;
}

function isAlreadyRedeemedLikeError(message: string) {
  const m = message.toLowerCase();
  return (
    m.includes("max_redemptions") ||
    m.includes("max redemptions") ||
    m.includes("already redeemed") ||
    m.includes("redemption") ||
    m.includes("expired") // treat as handled in friendly UI (not idempotent)
  );
}

export default async function SharePage({ searchParams }: PageProps) {
  const t = getParam(searchParams, "t");

  // Missing token => friendly error
  if (!t) {
    return (
      <main className="mx-auto max-w-xl p-6">
        <h1 className="text-xl font-semibold">Invalid share link</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This link is missing a token. Please request a new share link from the deal owner.
        </p>
      </main>
    );
  }

  const supabase = await createClient();

  // Auth gate (do NOT change auth flow again)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?returnTo=${encodeURIComponent(buildReturnTo(t))}`);
  }

  // 1) Try to redeem via RPC (primary path)
  const redeem = await supabase.rpc("redeem_deal_share_token", { p_token: t });

  if (!redeem.error && redeem.data) {
    const dealId = redeem.data as string;
    redirect(`/deal/${dealId}?mode=shared`);
  }

  // 2) Idempotency fallback:
  // If redemption fails (e.g., max_redemptions reached) but the current user
  // already has VIEWER access AND we can still resolve deal_id from token, redirect anyway.
  //
  // NOTE: This assumes your RLS allows authenticated users to read:
  // - their own rows in deal_access_grants
  // - the deal_id for a token they present (common pattern), OR token table readable via SECURITY DEFINER policies.
  // If RLS blocks these reads, we’ll show a friendly error below.
  const redeemMsg = redeem.error?.message ?? "Unknown error";

  if (isAlreadyRedeemedLikeError(redeemMsg)) {
    // Attempt to resolve deal_id from the token row
    const tokenRow = await supabase
      .from("deal_share_tokens")
      .select("deal_id, expires_at")
      .eq("token", t)
      .maybeSingle();

    const dealId = tokenRow.data?.deal_id as string | undefined;

    if (dealId) {
      // Check the user already has a grant for this deal
      const grant = await supabase
        .from("deal_access_grants")
        .select("role")
        .eq("deal_id", dealId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (grant.data?.role === "VIEWER" || grant.data?.role === "OWNER") {
        redirect(`/deal/${dealId}?mode=shared`);
      }
    }
  }

  // Friendly error states (expired / invalid / exhausted without grant)
  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="text-xl font-semibold">This share link can’t be used</h1>

      <p className="mt-2 text-sm text-muted-foreground">
        The link may be expired, already redeemed, or invalid.
      </p>

      <div className="mt-4 rounded-md border p-3 text-sm">
        <div className="font-medium">Details</div>
        <div className="mt-1 text-muted-foreground break-words">{redeemMsg}</div>
      </div>

      <p className="mt-4 text-sm text-muted-foreground">
        If you think this is a mistake, request a new share link from the deal owner.
      </p>
    </main>
  );
}
