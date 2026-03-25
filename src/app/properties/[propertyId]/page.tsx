import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { AppHeader } from "@/components/layout/AppHeader";
import { PropertyDetailClient } from "@/components/properties/PropertyDetailClient";
import { toHomeownerProperty } from "@/lib/property/projections";
import type { HomeownerReviewRequest } from "@/components/properties/ReviewRequestPanel";

export const runtime = "nodejs";

const OWNED_SELECT =
  "id, address_line1, address_line2, city, state, postal_code, status, ownership_status, is_private, owner_user_id, claimed_by_user_id, created_by_user_id, created_at, updated_at, has_secured_property_debt, secured_property_debt_amount, secured_debt_verification_status, secured_debt_fresh_until, ownership_type, occupancy_use, occupancy_use_other, major_condition_issue, major_condition_issue_details, known_liens_and_claims, total_known_debt_amount, total_known_debt_confidence, debt_statement_availability, title_claims_known, title_claims_details, owner_stated_fmv, owner_stated_fmv_confidence, owner_stated_fmv_source, owner_stated_fmv_source_other, willing_to_proceed_formal_review";

function formatAddress(row: any): string {
  return [
    row.address_line1,
    row.address_line2,
    row.city,
    row.state,
    row.postal_code,
  ]
    .filter(Boolean)
    .join(", ");
}

type PageProps = {
  params: Promise<{ propertyId: string }>;
};

export default async function PropertyDetailPage({ params }: PageProps) {
  const { propertyId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?returnTo=${encodeURIComponent(`/properties/${propertyId}`)}`);
  }

  const svc = createServiceClient();

  const { data: row, error } = await (svc.from("properties") as any)
    .select(OWNED_SELECT)
    .eq("id", propertyId)
    .or(
      `owner_user_id.eq.${user.id},created_by_user_id.eq.${user.id},claimed_by_user_id.eq.${user.id}`,
    )
    .maybeSingle();

  if (error || !row) {
    notFound();
  }

  const address_display = formatAddress(row);
  const property = toHomeownerProperty(row, {
    address_display,
    visibility: "owned",
  });

  // Fetch most recent deal thread linked to this property
  let linkedDeal: {
    thread_id: string;
    thread_status: string;
    deal_id: string | null;
    deal_status: string | null;
    deal_title: string | null;
  } | null = null;

  try {
    const { data: threadRow } = await (svc.from("deal_threads") as any)
      .select("id, status, deal_id")
      .eq("property_id", propertyId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (threadRow?.deal_id) {
      const { data: dealRow } = await (svc.from("deals") as any)
        .select("id, status, title")
        .eq("id", threadRow.deal_id)
        .maybeSingle();

      linkedDeal = {
        thread_id: threadRow.id,
        thread_status: threadRow.status,
        deal_id: threadRow.deal_id,
        deal_status: dealRow?.status ?? null,
        deal_title: dealRow?.title ?? null,
      };
    } else if (threadRow) {
      linkedDeal = {
        thread_id: threadRow.id,
        thread_status: threadRow.status,
        deal_id: null,
        deal_status: null,
        deal_title: null,
      };
    }
  } catch {
    // non-fatal — proceed without linked deal
  }

  // Fetch open/submitted review request for the linked deal + this property
  let reviewRequest: HomeownerReviewRequest | null = null;
  if (linkedDeal?.deal_id) {
    try {
      const { data: reqRow } = await (svc.from("deal_review_requests") as any)
        .select("id, status, requested_items, admin_note, submitted_at")
        .eq("deal_id", linkedDeal.deal_id)
        .eq("property_id", propertyId)
        .in("status", ["open", "submitted"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (reqRow) {
        reviewRequest = {
          id: reqRow.id,
          status: reqRow.status,
          requested_items: reqRow.requested_items ?? [],
          admin_note: reqRow.admin_note ?? null,
          submitted_at: reqRow.submitted_at ?? null,
        };
      }
    } catch {
      // non-fatal
    }
  }

  return (
    <div>
      <AppHeader />
      <main className="mx-auto max-w-2xl p-6 space-y-6">
        <PropertyDetailClient
          property={property}
          linkedDeal={linkedDeal}
          reviewRequest={reviewRequest}
        />
      </main>
    </div>
  );
}
