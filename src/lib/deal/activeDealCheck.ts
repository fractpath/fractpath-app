/**
 * Active deal detection helpers.
 *
 * "Active" means the deal thread is live / in-progress.
 * Source of truth: deal_threads.status CHECK constraint in the DB.
 * All valid statuses: draft | pending_owner | negotiating | decision_pending | accepted | closed
 *
 * "draft" is intentionally excluded — a draft thread is not yet a live deal.
 * "closed" is included — a closed deal means the property is already under agreement.
 *
 * Threads belonging to admin-voided deals (deals.admin_voided_at IS NOT NULL) are always
 * excluded — voiding should also update thread status to "voided_by_admin", but this join
 * guard handles partial-failure cases where the deal was stamped but threads were not yet
 * updated.
 */
export const ACTIVE_DEAL_STATUSES: string[] = [
  "pending_owner",
  "negotiating",
  "decision_pending",
  "accepted",
  "closed",
];

/**
 * Returns true if the given property already has at least one active deal thread
 * on a non-voided deal.
 * Accepts any Supabase client — works with both user and service clients.
 */
export async function propertyHasActiveDeal(
  supabase: any,
  propertyId: string,
): Promise<boolean> {
  // Fetch matching threads (not voided_by_admin) and then filter out threads
  // whose parent deal has been admin-voided.  Supabase does not support
  // negative join filters in a head-count query, so we fetch the thread IDs
  // with their deal_id and filter in application code.
  const { data, error } = await (supabase.from("deal_threads") as any)
    .select("id, deal_id")
    .eq("property_id", propertyId)
    .in("status", ACTIVE_DEAL_STATUSES);

  if (error) {
    // Surface the error so callers can decide — don't silently allow deal creation
    throw new Error(`Active deal check failed: ${error.message}`);
  }

  const threads: Array<{ id: string; deal_id: string | null }> = data ?? [];
  if (threads.length === 0) return false;

  // Check each thread's parent deal for admin_voided_at
  const dealIds = [...new Set(threads.map((t) => t.deal_id).filter(Boolean))] as string[];
  if (dealIds.length === 0) return false;

  const { data: voidedDeals, error: voidErr } = await (supabase.from("deals") as any)
    .select("id")
    .in("id", dealIds)
    .not("admin_voided_at", "is", null);

  if (voidErr) {
    // Non-fatal — fall back to treating all threads as active (safe default)
    console.error("active_deal_check_voided_deals_lookup_failed", voidErr.message);
    return threads.length > 0;
  }

  const voidedDealIds = new Set((voidedDeals ?? []).map((d: any) => d.id as string));
  const nonVoidedThreads = threads.filter((t) => !voidedDealIds.has(t.deal_id ?? ""));

  return nonVoidedThreads.length > 0;
}
