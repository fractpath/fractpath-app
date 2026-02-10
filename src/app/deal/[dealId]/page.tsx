import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabaseServer";
import { ShareDealCard } from "@/components/ShareDealCard";

type PageProps = {
  params: { dealId: string };
  searchParams?: Record<string, string | string[] | undefined>;
};

function getParam(
  searchParams: PageProps["searchParams"],
  key: string,
): string | null {
  const v = searchParams?.[key];
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export default async function DealPage({ params, searchParams }: PageProps) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?returnTo=${encodeURIComponent(`/deal/${params.dealId}`)}`);
  }

  const mode = getParam(searchParams, "mode");
  const isSharedMode = mode === "shared";

  const grant = await supabase
    .from("deal_access_grants")
    .select("role")
    .eq("deal_id", params.dealId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!grant.data?.role) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="text-xl font-semibold">Access denied</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You don’t have access to this deal (or it may no longer exist).
        </p>
        <div className="mt-4">
          <Link className="text-sm underline" href="/me">
            Go to my account
          </Link>
        </div>
      </main>
    );
  }

  const role = grant.data.role as "OWNER" | "VIEWER";
  const readOnly = role === "VIEWER" || isSharedMode;

  const dealRes = await supabase
    .from("deals")
    .select("*")
    .eq("id", params.dealId)
    .maybeSingle();

  if (dealRes.error || !dealRes.data) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="text-xl font-semibold">Deal unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This deal can’t be loaded. It may have been deleted, or your access
          may have changed.
        </p>

        {dealRes.error ? (
          <div className="mt-4 rounded-md border p-3 text-sm">
            <div className="font-medium">Details</div>
            <div className="mt-1 text-muted-foreground break-words">
              {dealRes.error.message}
            </div>
          </div>
        ) : null}

        <div className="mt-4">
          <Link className="text-sm underline" href="/me">
            Go to my account
          </Link>
        </div>
      </main>
    );
  }

  const deal = dealRes.data as Record<string, any>;

  return (
    <main className="mx-auto max-w-3xl p-6">
      {readOnly ? (
        <div className="mb-4 rounded-md border p-3">
          <div className="text-sm font-medium">Read-only shared deal</div>
          <div className="mt-1 text-sm text-muted-foreground">
            You can view this deal, but you can’t make changes.
          </div>
        </div>
      ) : null}

      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-xl font-semibold">Deal</h1>
        <div className="text-sm text-muted-foreground">
          Role: <span className="font-medium text-foreground">{role}</span>
        </div>
      </div>

      <div className="mt-4 rounded-md border p-4 text-sm">
        <div className="grid gap-2">
          <div>
            <span className="font-medium">Deal ID:</span>{" "}
            <span className="break-words">{params.dealId}</span>
          </div>
          <div>
            <span className="font-medium">Mode:</span> {mode ?? "(none)"}
          </div>
          <div>
            <span className="font-medium">Editable:</span>{" "}
            {readOnly ? "No" : "Yes"}
          </div>
        </div>
      </div>

      {role === "OWNER" && !readOnly ? (
        <div className="mt-6">
          <ShareDealCard dealId={params.dealId} />
        </div>
      ) : null}

      <div className="mt-6">
        <div className="text-sm font-medium mb-2">
          Raw deal payload (temporary)
        </div>
        <pre className="rounded-md border p-4 text-xs overflow-auto">
          {JSON.stringify(deal, null, 2)}
        </pre>
      </div>

      <div className="mt-6 flex gap-4">
        <Link className="text-sm underline" href="/me">
          Back to my account
        </Link>
      </div>
    </main>
  );
}
