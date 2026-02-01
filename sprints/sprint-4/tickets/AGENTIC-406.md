# AGENTIC-406  
## Controlled Function — authorize_deal_version() (Sprint 4)

---

## Intent Freeze

Sprint 4 requires a constitution-safe pathway to update binding fields:

- `deals.current_version_id`
- version authorization markers on `deal_versions` (e.g., `authorized_at`)
- supersession (deauthorize prior authorized version)

This function is the **only** approved mechanism in Sprint 4 to:

- authorize a target `deal_versions` row
- deauthorize any prior authorized version for the deal
- update `deals.current_version_id`
- emit immutable, attributable audit events

No direct updates to binding fields outside controlled functions.

---

## Scope Classification

| Category | Classification |
|----------|---------------|
| DB Function | NEW |
| State Machine | NONE (paired with transition_deal_status in callers) |
| Authorization | ENFORCE |
| Audit | ENFORCE |
| Schema | USE EXISTING (Sprint 3 + AGENTIC-402) |

---

## Preconditions

- deal exists
- actor_user_id exists
- actor has role = HOMEOWNER on the deal (via deal_user_roles)
- (If required) actor satisfies any controller entitlement required for authorization
- version exists and belongs to the deal:
  - deal_versions.id = p_version_id
  - deal_versions.deal_id = p_deal_id
- version is currently unauthorized:
  - authorized_at IS NULL (or equivalent)
- deal not WITHDRAWN_BY_HOMEOWNER (terminal)
- function executes inside a transaction
- deal row must be locked FOR UPDATE for race safety

---

## Constitutional Invariants

- No silent mutation
- No direct writes to deals.current_version_id outside controlled functions
- Only HOMEOWNER may authorize versions
- Authorization is attributable and auditable
- Supersession is explicit:
  - prior authorized version(s) are deauthorized
  - new version authorized
  - current_version_id updated
- All irreversible actions emit immutable audit events

---

## Function Contract

### authorize_deal_version(p_deal_id, p_version_id, p_actor_user_id, p_metadata)

**Inputs**
- p_deal_id uuid
- p_version_id uuid
- p_actor_user_id uuid
- p_metadata jsonb (optional; must include explicit action name by caller)

**Effects**
- Locks the deal row.
- Identifies the prior authorized version (if any) for this deal.
- Deauthorizes prior authorized version.
- Authorizes the requested version.
- Updates deals.current_version_id to p_version_id through guarded pathway.
- Inserts audit events into deal_activity_log (or equivalent):
  - deal_version_deauthorized (if prior existed)
  - deal_version_authorized
  - deal_current_version_updated

**Return**
- void (authoritative changes are audited, not returned)

---

## Implementation Notes (Guard Bypass Mechanism)

Your environment already uses a guard mechanism for status updates:

```sql
PERFORM set_config('app.allow_deal_status_update', 'true', true);
