/**
 * Sprint 12 — RLS Grant Enforcement Verification
 *
 * This script documents how to verify that RLS correctly enforces
 * deal access via deal_access_grants with revoked_at/expires_at checks.
 *
 * Prerequisites:
 *   - Migration 20260301_sprint12_rls_grant_enforcement.sql applied
 *   - Two test users: USER_A (deal owner) and USER_B (no grant)
 *   - At least one deal owned by USER_A
 *
 * Verification Steps:
 *
 * 1. USER_A can see their deals (has active OWNER grant):
 *    curl -s -H "Authorization: Bearer <USER_A_TOKEN>" \
 *      "$SITE_URL/api/deals" | jq '.data | length'
 *    Expected: >= 1
 *
 * 2. USER_B cannot see USER_A's deals (no grant):
 *    curl -s -H "Authorization: Bearer <USER_B_TOKEN>" \
 *      "$SITE_URL/api/deals" | jq '.data | length'
 *    Expected: 0
 *
 * 3. After revoking USER_A's grant (via service-role SQL):
 *    UPDATE deal_access_grants
 *    SET revoked_at = now()
 *    WHERE user_id = '<USER_A_ID>' AND deal_id = '<DEAL_ID>';
 *
 *    USER_A can no longer see the deal:
 *    curl -s -H "Authorization: Bearer <USER_A_TOKEN>" \
 *      "$SITE_URL/deal/<DEAL_ID>" => shows "Access denied"
 *
 * 4. After un-revoking (service-role SQL):
 *    UPDATE deal_access_grants
 *    SET revoked_at = NULL
 *    WHERE user_id = '<USER_A_ID>' AND deal_id = '<DEAL_ID>';
 *
 *    USER_A can see the deal again.
 *
 * 5. Expiry test (service-role SQL):
 *    UPDATE deal_access_grants
 *    SET expires_at = now() - interval '1 hour'
 *    WHERE user_id = '<USER_A_ID>' AND deal_id = '<DEAL_ID>';
 *
 *    USER_A can no longer see the deal.
 *
 * SQL to check policy state:
 *    SELECT schemaname, tablename, policyname, cmd, qual
 *    FROM pg_policies
 *    WHERE tablename IN ('deals', 'deal_snapshots', 'deal_events',
 *                        'deal_versions', 'deal_access_grants')
 *    ORDER BY tablename, policyname;
 */

console.log("This is a documentation-only script.");
console.log("See the comments above for verification steps.");
console.log("");
console.log("To check policies exist in your DB, run:");
console.log(`
  SELECT tablename, policyname, cmd
  FROM pg_policies
  WHERE tablename IN ('deals','deal_snapshots','deal_events','deal_versions','deal_access_grants')
  ORDER BY tablename, policyname;
`);
