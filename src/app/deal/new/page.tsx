import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/layout/AppHeader";
import { OnboardingGate } from "@/components/onboarding/OnboardingGate";

import { NewDealClient } from "./NewDealClient";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Persona = "homeowner" | "buyer" | "realtor";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function NewDealPage({ searchParams }: PageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?returnTo=${encodeURIComponent("/deal/new")}`);
  }

  const persona: Persona =
    (user.user_metadata?.role as Persona | undefined) || "homeowner";

  // Read and validate optional propertyId from query string.
  // Invalid or missing values are treated as absent (no preselection).
  const params = searchParams ? await searchParams : {};
  const rawPropertyId = typeof params.propertyId === "string" ? params.propertyId : null;
  const initialPropertyId =
    rawPropertyId && UUID_RE.test(rawPropertyId) ? rawPropertyId : null;

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
          <NewDealClient
            persona={persona}
            initialPropertyId={initialPropertyId}
          />
        )}
      </main>
    </div>
  );
}
