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

  // Use canonical DB function (RLS-safe)
  const { data: result, error: rpcErr } = await supabase.rpc(
    "create_deal_with_owner_grant",
    {
      p_owner_user_id: user.id,
    },
  );

  if (rpcErr || !result) {
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

  // Assume function returns the deal id
  const dealId = result as string;

  redirect(`/deal/${encodeURIComponent(dealId)}`);
}
