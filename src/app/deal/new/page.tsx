import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { computeDeal } from "@/lib/computeAdapter";
import { insertDealSnapshot } from "@/lib/dealSnapshotDb";
import { getDefaultDealTerms, getDefaultScenario } from "@/lib/defaultScenario";

export const runtime = "nodejs";

export default async function NewDealPage() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    redirect("/login?returnTo=/deal/new");
  }

  const { data: dealId, error: rpcErr } = await supabase.rpc(
    "create_deal_with_owner_grant",
    {
      p_user_id: user.id,
    },
  );

  if (rpcErr || !dealId) {
    console.error("NEW_DEAL_CREATE_FAILED", {
      message: rpcErr?.message,
      code: (rpcErr as any)?.code,
      details: (rpcErr as any)?.details,
      hint: (rpcErr as any)?.hint,
    });

    const errorCode = encodeURIComponent(
      ((rpcErr as any)?.code as string) || "unknown",
    );

    redirect(`/dashboard?create=failed&code=${errorCode}`);
  }

  const canonicalInputs = {
    deal_terms: getDefaultDealTerms(),
    scenario: getDefaultScenario(),
  };

  const computeResult = await computeDeal(canonicalInputs);

  if (computeResult.ok) {
    const { compute_version, results } = computeResult.result;
    const computedAt = new Date().toISOString();

    const fullSnapshot = {
      contract_version: compute_version,
      schema_version: "1",
      inputs: canonicalInputs,
      outputs: { results },
      computed_at: computedAt,
      computed_by: user.id,
    };

    const snapshotResult = await insertDealSnapshot(
      supabase as any,
      dealId as string,
      user.id,
      fullSnapshot,
    );

    if (snapshotResult.ok) {
      try {
        await (supabase.from("deal_events") as any).insert({
          deal_id: dealId,
          event_type: "DEAL_SNAPSHOT_COMPUTED",
          payload: {
            snapshot_id: snapshotResult.id,
            compute_version,
            computed_at: computedAt,
          },
          created_by: user.id,
        });
      } catch (eventErr: any) {
        console.error("deal_events insert error:", eventErr?.message);
      }
    } else {
      console.error("SNAPSHOT_INSERT_FAILED_ON_CREATE", snapshotResult.error);
    }
  } else {
    console.error("COMPUTE_FAILED_ON_CREATE", computeResult.error);
  }

  redirect(`/deal/${encodeURIComponent(dealId as string)}`);
}
