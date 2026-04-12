/**
 * Active deal detection helpers.
 *
 * "Active" means the deal thread is live / in-progress.
 * Source of truth: deal_threads.status CHECK constraint in the DB.
 * All valid statuses: draft | pending_owner | negotiating | decision_pending | accepted | closed
 *
 * "draft" is intentionally excluded — a draft thread is not yet a live deal.
 * "closed" is included — a closed deal means the property is already under agreement.
 */
export const ACTIVE_DEAL_STATUSES: string[] = [
  "pending_owner",
  "negotiating",
  "decision_pending",
  "accepted",
  "closed",
];

/**
 * Returns true if the given property already has at least one active deal thread.
 * Accepts any Supabase client — works with both user and service clients.
 */
export async function propertyHasActiveDeal(
  supabase: any,
  propertyId: string,
): Promise<boolean> {
  const { count, error } = await (supabase.from("deal_threads") as any)
    .select("id", { count: "exact", head: true })
    .eq("property_id", propertyId)
    .in("status", ACTIVE_DEAL_STATUSES);

  if (error) {
    // Surface the error so callers can decide — don't silently allow deal creation
    throw new Error(`Active deal check failed: ${error.message}`);
  }

  return (count ?? 0) > 0;
}
