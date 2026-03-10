export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { compareSnapshotDisplay } from "@/lib/snapshotCompare";
import { extractDealDisplayModel } from "@/lib/dealSnapshotDisplay";

function formatValue(v: unknown): string {
  if (v == null) return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(n);
}

function humanLabel(key: string): string {
  switch (key) {
    case "propertyValue":
      return "FMV";
    case "upfrontAmount":
      return "Upfront";
    case "monthlyPayment":
      return "Monthly";
    case "paymentCount":
      return "Payments";
    case "exitYear":
      return "Exit Year";
    default:
      return key;
  }
}

type SearchParams = Record<string, string | string[] | undefined>;

type PageProps = {
  params: Promise<{ dealId?: string }>;
  searchParams?: Promise<SearchParams>;
};

function getParam(
  searchParams: SearchParams | undefined,
  key: string,
): string | null {
  const v = searchParams?.[key];
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function isUuid(v: string | undefined | null): v is string {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      v,
    )
  );
}

export default async function ComparePage({ params, searchParams }: PageProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;

  const dealId = resolvedParams?.dealId as string | undefined;

  if (!isUuid(dealId)) {
    redirect("/me");
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?returnTo=${encodeURIComponent(`/deal/${dealId}/compare`)}`);
  }

  const aId = getParam(resolvedSearchParams, "a");
  const bId = getParam(resolvedSearchParams, "b");

  if (!isUuid(aId) || !isUuid(bId)) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="text-xl font-semibold">Snapshot comparison</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Two snapshot IDs are required. Use <code>?a=&lt;id&gt;&amp;b=&lt;id&gt;</code> to compare.
        </p>
        <div className="mt-4">
          <Link className="text-sm underline" href={`/deal/${dealId}`}>
            Back to deal
          </Link>
        </div>
      </main>
    );
  }

  if (aId === bId) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="text-xl font-semibold">Snapshot comparison</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Both snapshot IDs are the same. Select two different snapshots to compare.
        </p>
        <div className="mt-4">
          <Link className="text-sm underline" href={`/deal/${dealId}`}>
            Back to deal
          </Link>
        </div>
      </main>
    );
  }

  const dealRes = await supabase
    .from("deals")
    .select("id")
    .eq("id", dealId)
    .maybeSingle();

  if (dealRes.error || !dealRes.data) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="text-xl font-semibold">Access denied</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You don&apos;t have access to this deal (or it may no longer exist).
        </p>
        <div className="mt-4">
          <Link className="text-sm underline" href="/me">
            Go to my account
          </Link>
        </div>
      </main>
    );
  }

  const [snapARes, snapBRes] = await Promise.all([
    supabase
      .from("deal_snapshots")
      .select("id, deal_id, created_at, contract_version, schema_version, snapshot_json")
      .eq("id", aId)
      .maybeSingle(),
    supabase
      .from("deal_snapshots")
      .select("id, deal_id, created_at, contract_version, schema_version, snapshot_json")
      .eq("id", bId)
      .maybeSingle(),
  ]);

  const snapA = snapARes.data as Record<string, any> | null;
  const snapB = snapBRes.data as Record<string, any> | null;

  if (!snapA || !snapB) {
    const missing = !snapA && !snapB ? "Both snapshots" : !snapA ? "Snapshot A" : "Snapshot B";
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="text-xl font-semibold">Snapshot not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {missing} could not be found.
        </p>
        <div className="mt-4">
          <Link className="text-sm underline" href={`/deal/${dealId}`}>
            Back to deal
          </Link>
        </div>
      </main>
    );
  }

  if (snapA.deal_id !== dealId || snapB.deal_id !== dealId) {
    const bad = snapA.deal_id !== dealId && snapB.deal_id !== dealId
      ? "Both snapshots do not"
      : snapA.deal_id !== dealId
        ? "Snapshot A does not"
        : "Snapshot B does not";
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="text-xl font-semibold">Invalid comparison</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {bad} belong to this deal.
        </p>
        <div className="mt-4">
          <Link className="text-sm underline" href={`/deal/${dealId}`}>
            Back to deal
          </Link>
        </div>
      </main>
    );
  }

  const jsonA = snapA.snapshot_json ?? {};
  const jsonB = snapB.snapshot_json ?? {};

  const result = compareSnapshotDisplay(jsonA, jsonB);
  const totalDiffs = result.inputDiffs.length + result.outputDiffs.length + result.metaDiffs.length;

  return (
    <main className="mx-auto max-w-3xl p-6">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-xl font-semibold">Snapshot comparison</h1>
        <span className="text-xs text-muted-foreground">Read-only view</span>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="rounded-md border p-3 text-sm">
          <div className="text-xs font-medium text-muted-foreground">Snapshot A</div>
          <div className="mt-1 text-xs break-all">{aId}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            v{snapA.contract_version} / s{snapA.schema_version}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {new Date(snapA.created_at).toLocaleString()}
          </div>
        </div>
        <div className="rounded-md border p-3 text-sm">
          <div className="text-xs font-medium text-muted-foreground">Snapshot B</div>
          <div className="mt-1 text-xs break-all">{bId}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            v{snapB.contract_version} / s{snapB.schema_version}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {new Date(snapB.created_at).toLocaleString()}
          </div>
        </div>
      </div>

      {totalDiffs === 0 ? (
        <div className="mt-6 rounded-md border p-4">
          <p className="text-sm text-muted-foreground">
            No differences found between these two snapshots.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-4 text-xs text-muted-foreground">
            {totalDiffs} field{totalDiffs !== 1 ? "s" : ""} changed
          </div>

          {result.metaDiffs.length > 0 ? (
            <section className="mt-4 rounded-md border p-4">
              <h2 className="text-sm font-semibold">Metadata</h2>
              <div className="mt-3 space-y-2">
                {result.metaDiffs.map((d) => (
                  <div key={d.key} className="rounded-md bg-muted p-3 text-xs">
                    <div className="font-medium">{humanLabel(d.key)}</div>
                    <div className="mt-1 grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-muted-foreground">A: </span>
                        <span>{formatValue(d.a)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">B: </span>
                        <span>{formatValue(d.b)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {result.inputDiffs.length > 0 ? (
            <section className="mt-4 rounded-md border p-4">
              <h2 className="text-sm font-semibold">Input changes</h2>
              <div className="mt-3 space-y-2">
                {result.inputDiffs.map((d) => (
                  <div key={d.key} className="rounded-md bg-muted p-3 text-xs">
                    <div className="font-medium">{humanLabel(d.key)}</div>
                    <div className="mt-1 grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-muted-foreground">A: </span>
                        <span>{formatValue(d.a)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">B: </span>
                        <span>{formatValue(d.b)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {result.outputDiffs.length > 0 ? (
            <section className="mt-4 rounded-md border p-4">
              <h2 className="text-sm font-semibold">Output changes</h2>
              <div className="mt-3 space-y-2">
                {result.outputDiffs.map((d) => (
                  <div key={d.key} className="rounded-md bg-muted p-3 text-xs">
                    <div className="font-medium">{humanLabel(d.key)}</div>
                    <div className="mt-1 grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-muted-foreground">A: </span>
                        <span>{formatValue(d.a)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">B: </span>
                        <span>{formatValue(d.b)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}

      <div className="mt-6 flex gap-4">
        <Link className="text-sm underline" href={`/deal/${dealId}`}>
          Back to deal
        </Link>
        <Link
          className="text-sm underline"
          href={`/deal/${dealId}/compare?a=${bId}&b=${aId}`}
        >
          Swap A / B
        </Link>
      </div>
    </main>
  );
}
