# Withdraw Offer Regression — Discovery Log

Date: 2026-03-05

## Task D1 — DB Evidence for Deal 95d3f0b8-1d76-4769-8e86-32dc0926c485

### 1. Deal row

```
                  id                  |            owner_user_id             | status | created_from | source_ref |          created_at
--------------------------------------+--------------------------------------+--------+--------------+------------+-------------------------------
 95d3f0b8-1d76-4769-8e86-32dc0926c485 | 0faf6e11-295f-48a2-88b8-bc9161698340 | DRAFT  | app          | create     | 2026-03-05 02:31:43.989422+00
(1 row)
```

### 2. Threads for the deal

```
                  id                  |               deal_id                |             property_id              |    status     |            buyer_user_id             | owner_user_id |          created_at           |          updated_at
--------------------------------------+--------------------------------------+--------------------------------------+---------------+--------------------------------------+---------------+-------------------------------+-------------------------------
 c5e2b18f-2ed9-4c77-81a8-b7bdce27e983 | 95d3f0b8-1d76-4769-8e86-32dc0926c485 | fda3d094-332a-4796-ade4-461dd0c710e9 | pending_owner | cee2ecc6-7e27-4bd1-92a5-1239758f8854 |               | 2026-03-05 02:32:01.104689+00 | 2026-03-05 02:32:01.540848+00
(1 row)
```

### 3. Proposals on those threads

```
                  id                  |              thread_id               |          created_by_user_id          |          created_at
--------------------------------------+--------------------------------------+--------------------------------------+------------------------------
 f3a59da5-1043-46df-a15d-cdd8b52af11a | c5e2b18f-2ed9-4c77-81a8-b7bdce27e983 | cee2ecc6-7e27-4bd1-92a5-1239758f8854 | 2026-03-05 02:32:01.39851+00
(1 row)
```

### 4. Deal events

```
   event_type    |                                                               payload                                                               |          created_at
-----------------+-------------------------------------------------------------------------------------------------------------------------------------+-------------------------------
 offer_submitted | {"mode": "known_email", "thread_id": "c5e2b18f-2ed9-4c77-81a8-b7bdce27e983", "proposal_id": "f3a59da5-1043-46df-a15d-cdd8b52af11a"} | 2026-03-05 02:32:02.194289+00
(1 row)
```

### 5. Access grants

```
               deal_id                |               user_id                | role  |              created_by              | revoked_at | expires_at |          created_at
--------------------------------------+--------------------------------------+-------+--------------------------------------+------------+------------+-------------------------------
 95d3f0b8-1d76-4769-8e86-32dc0926c485 | cee2ecc6-7e27-4bd1-92a5-1239758f8854 | OWNER | cee2ecc6-7e27-4bd1-92a5-1239758f8854 |            |            | 2026-03-05 02:31:43.989422+00
 95d3f0b8-1d76-4769-8e86-32dc0926c485 | 0faf6e11-295f-48a2-88b8-bc9161698340 | OWNER | cee2ecc6-7e27-4bd1-92a5-1239758f8854 |            |            | 2026-03-05 02:32:02.074795+00
(2 rows)
```

### DB state summary

- Deal exists, status=DRAFT, created via app
- owner_user_id was reassigned from buyer (cee2ecc6) to property owner (0faf6e11) by submit-offer
- One thread exists, status=**pending_owner** (the expected withdrawable state)
- One proposal exists, created by buyer (cee2ecc6)
- One event: offer_submitted with mode=known_email
- Two grants: buyer has OWNER, property owner has OWNER (Phase 2b minting worked)
- **Backend state is fully consistent with "submitted and withdrawable"**

---

## Task D2 — Withdraw Implementation in Code

### Withdraw route

File: `src/app/api/threads/[threadId]/withdraw/route.ts`

```
12:// So "withdraw" is implemented as DELETE of the pending_owner thread + children.
35:    return json(403, { error: "Only the buyer can withdraw" });
40:      error: "Can only withdraw threads in pending_owner status",
62:      event_type: "offer_withdrawn",
68:  // Logical status "withdrawn" even though the row is deleted.
69:  return json(200, { ok: true, status: "withdrawn", deleted: true });
```

Route is present and functional. It requires:
- Authenticated user = thread's buyer_user_id
- Thread status = "pending_owner"
- Deletes thread + children, inserts offer_withdrawn event

### ActiveThreadBanner component

File: `src/components/deal/ActiveThreadBanner.tsx`

The component exists and is correctly implemented:
- Accepts `threadId` and `threadStatus` props
- Only renders when `threadStatus === "pending_owner"` (line 37)
- Shows "Withdraw Offer" button that POSTs to `/api/threads/${threadId}/withdraw`
- On success, calls `router.refresh()` to reload the page

### Activity feed labels

File: `src/components/deal/DealActivityFeed.tsx`

```
15:  offer_withdrawn: "Offer withdrawn",
30:  offer_withdrawn: "bg-amber-100 text-amber-800",
```

Correctly maps the event type.

---

## Task D3 — UI Action State Rendering

### Deal page: `src/app/deal/[dealId]/page.tsx`

**Lines 92-99:** Server-side fetch of `activeThread`:
```ts
const { data: activeThreads } = await (svc.from("deal_threads") as any)
  .select("id, status")
  .eq("deal_id", dealId)
  .in("status", ["pending_owner"])
  .limit(1);

const activeThread =
  activeThreads && activeThreads.length > 0 ? activeThreads[0] : null;
```

**Lines 114-120:** `activeThread` is passed only to `DealHeader`:
```tsx
<DealHeader
  dealId={dealId}
  readOnly={!isOwner}
  activeThread={activeThread}
  initialTitle={headerTitle}
  initialProperty={headerProperty}
/>
```

**CRITICAL FINDING: `ActiveThreadBanner` is NEVER imported or rendered on this page.**

### DealHeader: `src/components/deals/DealHeader.tsx`

**Line 173:** `hasActiveThread` is computed:
```ts
const hasActiveThread = activeThread?.status === "pending_owner";
```

**Line 174:** Used ONLY to disable the "Submit Offer" button:
```ts
const canMakeOffer = !!property?.property_id && !readOnly && !hasActiveThread;
```

**Lines 207-244:** Always renders all three buttons regardless of thread state:
- "+ Add property" (line 208-216) — disabled only by `readOnly`
- "Save" (line 218-226) — disabled only by `readOnly`
- "Submit Offer" (line 228-243) — disabled by `!canMakeOffer` (which includes `!hasActiveThread`)

**When `hasActiveThread` is true:**
- "Submit Offer" button is **disabled** (greyed out, shows tooltip "Offer already pending")
- But "Save" button is still **enabled and visible**
- And "Withdraw Offer" banner is **never shown**

### Import verification

```
$ rg -n 'import.*ActiveThreadBanner|from.*ActiveThreadBanner' src
(zero results)
```

**`ActiveThreadBanner` is imported by ZERO files. It is a completely orphaned component.**

---

## Task D4 — Withdraw Backend Route

File: `src/app/api/threads/[threadId]/withdraw/route.ts`

The route is present, functional, and correctly implements withdrawal:
- POST endpoint
- Auth check: user must be the thread's buyer_user_id
- Status check: thread must be in "pending_owner" status
- On success: deletes thread + children, inserts offer_withdrawn event
- Returns `{ ok: true, status: "withdrawn", deleted: true }`

No regression in the backend route itself. The route is correct but unreachable from the UI because the banner component that calls it is never rendered.

---

## Task D5 — Diagnosis

### Root cause: `ActiveThreadBanner` is never rendered

The regression is a **frontend integration gap**, not a backend or branch-specific issue.

**Evidence chain:**
1. Backend state is correct: thread exists with status=pending_owner, offer_submitted event exists, buyer has OWNER grant.
2. The withdraw API route (`/api/threads/[threadId]/withdraw`) exists and is functional.
3. The `ActiveThreadBanner` component exists and correctly renders "Withdraw Offer" with the correct API call.
4. **But `ActiveThreadBanner` is never imported or rendered anywhere in the codebase.** Zero imports found.
5. The deal page (`src/app/deal/[dealId]/page.tsx`) fetches `activeThread` data and passes it to `DealHeader`, but `DealHeader` only uses it to disable the "Submit Offer" button — it does not render the banner.

**This is NOT specific to the owner-email-invite or outreach branch.** The banner is missing for ALL submitted offers regardless of mode.

**What the user sees vs. what should happen:**
- Current: "Submit Offer" is greyed out (disabled) but still visible. "Save" is active. No withdraw UI.
- Expected: When an active thread exists with status=pending_owner, the page should show `ActiveThreadBanner` with "Withdraw Offer" button, and optionally hide/replace the Save and Submit Offer buttons.

### Secondary issue: "Save" button visible during pending offer

Even if the banner were rendered, the "Save" button (which persists deal header to server) is not disabled when an active thread exists. The `readOnly` prop controls it, but `readOnly` is `!isOwner`, meaning the buyer (who is OWNER) always sees an active Save button.

This is a UX concern (not a functional bug): saving header metadata during a pending offer is harmless but potentially confusing.

---

## Task D6 — Minimal Next-Run Allowlist Proposal

To fix this regression, the smallest change is to render `ActiveThreadBanner` on the deal page when `activeThread` is present. Two files are involved:

### Required allowlist:

```
src/app/deal/[dealId]/page.tsx
```

**Scope:** Import `ActiveThreadBanner` and render it between `DealHeader` and `DealDetailWidgetPanel` when `activeThread` is non-null, passing `threadId={activeThread.id}` and `threadStatus={activeThread.status}`.

### Optional (UX polish, not required for the fix):

```
src/components/deals/DealHeader.tsx
```

**Scope:** When `hasActiveThread` is true, also disable or hide the "Save" button and/or show a visual indicator that the deal is in submitted state. This is cosmetic and can be deferred.

### NOT needed:

- `src/components/deal/ActiveThreadBanner.tsx` — Component is correct as-is.
- `src/app/api/threads/[threadId]/withdraw/route.ts` — Route is correct as-is.
- `src/components/deal/DealActivityFeed.tsx` — Already handles offer_withdrawn events.
- Any migrations, schema changes, or RLS changes.

---

## Build Verification

```
$ npm run build
✓ Compiled successfully. All routes compiled, no errors.
```

---

## Output Summary

### (a) Files changed
- `docs/withdraw-regression-discovery.md` (this file, created)

### (b) Commands run
- 5 psql queries against Supabase Postgres (deal, threads, proposals, events, grants)
- `rg -n "withdraw|withdrawn|..." src` — found withdraw route + banner component + activity feed
- `rg -n "ActiveThreadBanner" src` — found component definition only (zero imports)
- `rg -n "import.*ActiveThreadBanner" src` — zero results (confirms orphaned)
- `npm run build` — passed

### (c) Exact candidate files + line ranges
- `src/app/deal/[dealId]/page.tsx` lines 92-99 (activeThread fetch), lines 110-120 (render — banner missing)
- `src/components/deals/DealHeader.tsx` lines 173-174 (hasActiveThread used only for button disable), lines 207-244 (always renders Save + Submit Offer)
- `src/components/deal/ActiveThreadBanner.tsx` lines 1-67 (complete, correct, but orphaned)
- `src/app/api/threads/[threadId]/withdraw/route.ts` (correct, functional, unreachable from UI)

### (d) Evidence-based diagnosis
**Root cause:** `ActiveThreadBanner` is a fully implemented but orphaned component — it is never imported or rendered anywhere. The deal page passes `activeThread` to `DealHeader` which only uses it to disable the Submit Offer button, not to show the Withdraw Offer banner.

### (e) Minimal next-run allowlist
```
- src/app/deal/[dealId]/page.tsx
```
Optional (UX polish):
```
- src/components/deals/DealHeader.tsx
```
