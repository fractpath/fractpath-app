import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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
  if (m.includes("max") || m.includes("redemption")) return "This share link has already been used.";
  if (m.includes("not found") || m.includes("invalid") || m.includes("token")) return "This share link is invalid.";
  if (m.includes("unauthorized") || m.includes("auth")) return "Please log in to use this share link.";

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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?returnTo=${encodeURIComponent(`/share?t=${t}`)}`);
  }

  const { data, error } = await supabase.rpc("redeem_deal_share_token", {
    p_token: t,
  });

  if (error || !data) {
    const msg = friendlyTokenError(error?.message ?? "");
    return (
      <main className="mx-auto max-w-xl p-6">
        <h1 className="text-lg font-semibold">Unable to open shared deal</h1>
        <p className="mt-2 text-sm text-muted-foreground">{msg}</p>
        <p className="mt-4 text-sm">
          If you believe this is a mistake, ask the deal owner to send a new share link.
        </p>
      </main>
    );
  }

  redirect(`/deal/${data}?mode=shared`);
}
