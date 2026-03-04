import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/layout/AppHeader";

type PageProps = { params: Promise<{ threadId: string }> };

export default async function ThreadPage(ctx: PageProps) {
  const { threadId } = await ctx.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(`/login?returnTo=${encodeURIComponent(`/thread/${threadId}`)}`);

  const threadRes = await supabase
    .from("deal_threads")
    .select("id,status,property_id,created_at")
    .eq("id", threadId)
    .single();

  if (threadRes.error || !threadRes.data) {
    return (
      <div>
        <AppHeader />
        <main className="mx-auto max-w-3xl p-6">
          <div className="rounded-lg border p-4 text-sm">
            Couldn&apos;t load thread.
          </div>
        </main>
      </div>
    );
  }

  const proposalRes = await supabase
    .from("deal_proposals")
    .select("id,deal_id,thread_id,created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(1);

  const proposal = proposalRes.data?.[0] ?? null;

  // If we have a deal_id, send owner straight to the deal page
  if (proposal?.deal_id) {
    redirect(`/deal/${proposal.deal_id}#offer`);
  }

  return (
    <div>
      <AppHeader />
      <main className="mx-auto max-w-3xl p-6 space-y-6">
        <h1 className="text-2xl font-semibold">Offer review</h1>

        <div className="rounded-lg border p-4 text-sm space-y-2">
          <div>
            <span className="font-medium">Thread:</span> {threadRes.data.id}
          </div>
          <div>
            <span className="font-medium">Status:</span> {threadRes.data.status}
          </div>
          <div className="text-muted-foreground">
            No proposal/deal found for this thread yet.
          </div>
        </div>

        <Link className="text-sm underline" href="/dashboard">
          Back to Dashboard
        </Link>
      </main>
    </div>
  );
}