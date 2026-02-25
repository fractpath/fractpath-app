import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/layout/AppHeader";
import { OnboardingGate } from "@/components/onboarding/OnboardingGate";

import { NewDealClient } from "./NewDealClient";

export const dynamic = "force-dynamic";

type Persona = "homeowner" | "buyer" | "realtor";

export default async function NewDealPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?returnTo=${encodeURIComponent("/deal/new")}`);
  }

  const persona: Persona =
    (user.user_metadata?.role as Persona | undefined) || "homeowner";

  return (

    <div>
      <AppHeader />
      <main className="mx-auto max-w-3xl p-6">
        <OnboardingGate />

        {persona === "realtor" ? (
          <div className="rounded-lg border p-6">
            <h1 className="text-lg font-semibold">Cannot create deals</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Realtors are view-only and cannot create deals. You can view
              deals that have been shared with you from your dashboard.
            </p>
          </div>
        ) : (
          <NewDealClient persona={persona} />
        )}
      </main>
    </div>
  );
}
