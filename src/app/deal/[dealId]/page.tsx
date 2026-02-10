// src/app/deal/[dealId]/page.tsx

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ShareDealCard } from "@/components/ShareDealCard";

type PageProps = {
  // keep it permissive; we'll normalize at runtime
  params: { dealId?: string } | Promise<{ dealId?: string }>;
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

function isUuid(v: string | undefined): v is string {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      v,
    )
  );
}

type DealRow = Record<string, any>;

async function loadDealByIdOrDealId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  dealId: string,
): Promise<{
  deal: DealRow | null;
  debug: { tried: string[]; errors: Array<{ key: string; message: string }> };
}> {
  const debug = {
    tried: [] as string[],
    errors: [] as Array<{ key: string; message: string }>,
  };

  debug.tried.push("deals.id");
  const byId = await supabase
    .from("deals")
    .select("*")
    .eq("id", dealId)
    .maybeSingle();

  if (byId.data) return { deal: byId.data as DealRow, debug };
  if (byId.error)
    debug.errors.push({ key: "deals.id", message: byId.error.message });

  debug.tried.push("deals.deal_id");
  const byDealId = await supabase
    .from("deals")
    .select("*")
    .eq("deal_id", dealId)
    .maybeSingle();

  if (byDealId.data) return { deal: byDealId.data as DealRow, debug };
  if (byDealId.error)
    debug.errors.push({
      key: "deals.deal_id",
      message: byDealId.error.message,
    });

  return { deal: null, debug };
}

export default async function DealPage({ params, searchParams }: PageProps) {
  // Normalize params to handle both plain object and Promise-like params
  const resolvedParams = await Promise.resolve(params as any);
  const dealIdRaw = resolvedParams?.dealId as unknown;

  // If dealId is missing/invalid, DO NOT redirect (it hides the problem).
  // Render a debug screen so we can see what's actually coming through in production.
  if (typeof dealIdRaw !== "string" || !isUuid(dealIdRaw)) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="text-xl font-semibold">Invalid deal route param</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The server did not receive a valid UUID for <code>dealId</code>.
        </p>

        <div className="mt-4 rounded-md border p-3 text-sm">
          <div className="font-medium">Param debug</div>
          <pre className="mt-2 text-xs overflow-auto">
            {JSON.stringify(
              {
                resolvedParams,
                dealIdRaw,
                typeOfDealIdRaw: typeof dealIdRaw,
                searchParams,
              },
              null,
              2,
            )}
          </pre>
        </div>

        <div className="mt-4 flex gap-4">
          <Link className="text-sm underline" href="/me">
            Back to my account
          </Link>
        </div>
      </main>
    );
  }

  const dealId = dealIdRaw;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?returnTo=${encodeURIComponent(`/deal/${dealId}`)}`);
  }

  const mode = getParam(searchParams, "mode");
  const isSharedMode = mode === "shared";

  const { deal, debug } = await loadDealByIdOrDealId(supabase, dealId);

  if (!deal) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="text-xl font-semibold">Access denied</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You don’t have access to this deal (or it may no longer exist).
        </p>

        <div className="mt-4 rounded-md border p-3 text-sm">
          <div className="font-medium">Debug</div>
          <div className="mt-1 text-muted-foreground break-words">
            <div>
              <span className="font-medium text-foreground">dealId param:</span>{" "}
              {dealId}
            </div>
            <div className="mt-1">
              <span className="font-medium text-foreground">userId:</span>{" "}
              {user.id}
            </div>
            <div className="mt-2">
              <span className="font-medium text-foreground">tried:</span>{" "}
              {debug.tried.join(" → ")}
            </div>
            {debug.errors.length ? (
              <div className="mt-2">
                <div className="font-medium text-foreground">errors:</div>
                <ul className="mt-1 list-disc pl-5">
                  {debug.errors.map((e, i) => (
                    <li key={i}>
                      <span className="font-medium">{e.key}:</span> {e.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="mt-2">
                No errors returned; query returned no rows.
              </div>
            )}
          </div>
        </div>

        <div className="mt-4">
          <Link className="text-sm underline" href="/me">
            Go to my account
          </Link>
        </div>
      </main>
    );
  }

  let role: "OWNER" | "VIEWER" =
    deal.created_by === user.id ? "OWNER" : "VIEWER";

  if (role !== "OWNER") {
    const grantRes = await supabase
      .from("deal_access_grants")
      .select("role")
      .eq("deal_id", dealId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (grantRes.data?.role === "OWNER" || grantRes.data?.role === "VIEWER") {
      role = grantRes.data.role;
    }
  }

  const readOnly = role === "VIEWER" || isSharedMode;

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
            <span className="font-medium">Deal ID (param):</span>{" "}
            <span className="break-words">{dealId}</span>
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
          <ShareDealCard dealId={dealId} />
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
