import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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

  const { data: dealRow, error: dealErr } = await supabase
    .from("deals")
    .insert({
      owner_user_id: user.id,
      mode: "app",
    })
    .select("id")
    .single();

  if (dealErr || !dealRow?.id) {
    console.error("NEW_DEAL_CREATE_FAILED", {
      message: dealErr?.message,
      code: (dealErr as any)?.code,
      details: (dealErr as any)?.details,
      hint: (dealErr as any)?.hint,
    });

    const errorCode =
      encodeURIComponent(((dealErr as any)?.code as string) || "unknown");

    redirect(`/dashboard?create=failed&code=${errorCode}`);
  }

  const dealId = dealRow.id as string;

  try {
    await supabase.from("deal_events").insert({
      deal_id: dealId,
      event_type: "DEAL_CREATED",
      actor_user_id: user.id,
    });
  } catch {
    // non-blocking
  }

  redirect(`/deal/${encodeURIComponent(dealId)}`);
}
