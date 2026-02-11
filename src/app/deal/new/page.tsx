import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * /deal/new
 * Production unblocker:
 * - Restore a static route so it wins over /deal/[dealId]
 * - Create a new deal for the signed-in user
 * - Redirect to /deal/:dealId
 *
 * Hard constraints:
 * - No schema changes
 * - Minimal logic
 * - Best-effort event insert (non-blocking)
 */

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

  // 1) Create deal row
  // NOTE: keep payload minimal to reduce RLS/column issues.
  // If your schema requires additional fields, the insert error will tell us exactly what.
  const { data: dealRow, error: dealErr } = await supabase
    .from("deals")
    .insert({
      owner_user_id: user.id,
      mode: "app",
    })
    .select("id")
    .single();

  if (dealErr || !dealRow?.id) {
    // Fail closed: go back to dashboard with a deterministic query param for UI messaging.
    // (We can add a toast later if needed, but not required to unblock.)
    redirect(`/dashboard?create=failed`);
  }

  const dealId = dealRow.id as string;

  // 2) Best-effort: insert a "deal created" event if your app uses it.
  // If this fails due to schema mismatch, it should not block deal creation.
  try {
    await supabase.from("deal_events").insert({
      deal_id: dealId,
      event_type: "DEAL_CREATED",
      actor_user_id: user.id,
    });
  } catch {
    // non-blocking
  }

  // 3) Redirect into the deal page
  redirect(`/deal/${encodeURIComponent(dealId)}`);
}
