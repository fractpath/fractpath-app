# Submitted-Offer Role-Gating Regression — Discovery Log

Date: 2026-03-05
Deal URL: /deal/95d3f0b8-1d76-4769-8e86-32dc0926c485

---

## D1 — DB Evidence

### 1. Deal row
```
id                                   | owner_user_id                        | status | created_from | source_ref | created_at
95d3f0b8-1d76-4769-8e86-32dc0926c485 | 0faf6e11-295f-48a2-88b8-bc9161698340 | DRAFT  | app          | create     | 2026-03-05 02:31:43.989422+00
```
- `owner_user_id` = `0faf6e11` (the homeowner, assigned by submit-offer)

### 2. Thread rows
```
id                                   | deal_id                              | property_id                          | status        | buyer_user_id                        | owner_user_id | created_at
c5e2b18f-2ed9-4c77-81a8-b7bdce27e983 | 95d3f0b8-1d76-4769-8e86-32dc0926c485 | fda3d094-332a-4796-ade4-461dd0c710e9 | pending_owner | cee2ecc6-7e27-4bd1-92a5-1239758f8854 | (null)        | 2026-03-05 02:32:01.104689+00
```
- Thread status = `pending_owner`
- `buyer_user_id` = `cee2ecc6` (the buyer)
- Thread `owner_user_id` is NULL (not set by submit-offer route)

### 3. Proposal rows
```
id                                   | thread_id                            | created_by_user_id                   | created_at
f3a59da5-1043-46df-a15d-cdd8b52af11a | c5e2b18f-2ed9-4c77-81a8-b7bdce27e983 | cee2ecc6-7e27-4bd1-92a5-1239758f8854 | 2026-03-05 02:32:01.39851+00
```

### 4. Deal events
```
event_type      | payload                                                                                                                             | created_at
offer_submitted | {"mode":"known_email","thread_id":"c5e2b18f-...","proposal_id":"f3a59da5-..."}                                                      | 2026-03-05 02:32:02.194289+00
```

### 5. Grants
```
deal_id                              | user_id                              | role  | created_by                           | revoked_at | expires_at | created_at
95d3f0b8-1d76-4769-8e86-32dc0926c485 | cee2ecc6-7e27-4bd1-92a5-1239758f8854 | OWNER | cee2ecc6-7e27-4bd1-92a5-1239758f8854 |            |            | 2026-03-05 02:31:43.989422+00
95d3f0b8-1d76-4769-8e86-32dc0926c485 | 0faf6e11-295f-48a2-88b8-bc9161698340 | OWNER | cee2ecc6-7e27-4bd1-92a5-1239758f8854 |            |            | 2026-03-05 02:32:02.074795+00
```
- **Both buyer (`cee2ecc6`) and homeowner (`0faf6e11`) have OWNER grants.**
- There is no VIEWER role, no COUNTERPARTY role — only two OWNER rows.

### Key identity map
| User ID (prefix) | Actual role       | Grant role |
|-------------------|-------------------|------------|
| `cee2ecc6`        | Buyer (created deal, submitted offer) | OWNER |
| `0faf6e11`        | Homeowner (property owner, deal.owner_user_id) | OWNER |

---

## D2 — Page-State Render Logic

### Deal page: `src/app/deal/[dealId]/page.tsx`

**Primary path (lines 33-177):** Loads deal via user's Supabase client (RLS). If deal found:

- **Lines 34-38:** Fetches deal row including `owner_user_id`
- **Lines 41-47:** Fetches user's grant from `deal_access_grants` (role)
- **Lines 49-51:** Computes `isOwner`:
  ```ts
  const userRole = grant?.role ?? null;
  const isOwner = userRole === "OWNER" || (deal as any).owner_user_id === user.id;
  ```
- **Lines 93-100:** Fetches `activeThread` from `deal_threads` where status IN `["pending_owner"]`, selects `id, status` only — **does NOT select `buyer_user_id`**
- **Lines 115-121:** Passes to `<DealHeader>`:
  - `readOnly={!isOwner}` → both users are OWNER → **readOnly=false for both**
  - `activeThread={activeThread}` → thread object with `{id, status}`
- **Lines 123-128:** Renders `<ActiveThreadBanner>` **unconditionally when `activeThread` is non-null** — no role check
- **Line 136:** `canEdit={isOwner}` → both users are OWNER → **editable for both**

**Owner fallback path (lines 180-264):** Only reached when primary path finds NO deal via RLS. When homeowner has an OWNER grant, the primary path (line 40 `if (deal)`) succeeds, so the homeowner **never reaches** the owner fallback path. The fallback path was designed for the case where the owner lacks a direct grant and entitlement must be proven via thread→property→owner_user_id chain. Since `submit-offer` now mints an OWNER grant for the homeowner, the redirect to `/threads/${threadId}` on line 264 **never fires**.

### ActiveThreadBanner: `src/components/deal/ActiveThreadBanner.tsx`

- **Props (lines 6-9):** `{ threadId: string; threadStatus: string }` — **no role/userId prop**
- **Line 37:** `if (threadStatus !== "pending_owner") return null;` — **renders for ALL users** when thread is pending_owner
- **Lines 39-65:** Renders amber banner with "Withdraw Offer" button. No role gating.

### DealHeader: `src/components/deals/DealHeader.tsx`

- **Lines 196-204:** Title input: `disabled={readOnly}` (readOnly is `!isOwner`)
- **Lines 208-216:** "+ Add property" button: `disabled={readOnly}`
- **Lines 218-226:** "Save" button: `disabled={readOnly}`
- **Lines 228-243:** "Submit Offer" button: `disabled={!canMakeOffer}` where `canMakeOffer = !!property?.property_id && !readOnly && !hasActiveThread`
- **Line 173:** `hasActiveThread = activeThread?.status === "pending_owner"` — used only for Submit Offer disable, **not** for title/save/add-property disable
- **Net effect:** When `readOnly=false` (both buyer and owner), title/save/add-property remain enabled even during pending_owner state.

### Owner Decision UI: `src/components/threads/ThreadActionPanel.tsx`

- **Lines 92-158:** OWNER view renders Accept/Reject buttons when `isOwner=true`, `proposalStatus === "submitted"`, `threadStatus === "pending_owner"`, and not finalized.
- This component is rendered by `ThreadDetailView` (line 173), which is rendered by `/threads/[threadId]/page.tsx`.
- **The deal page (`/deal/[dealId]/page.tsx`) does NOT render ThreadActionPanel or any Accept/Reject UI.** It was never wired there.

### Dashboard: `src/app/dashboard/page.tsx`

- **Lines 651-669:** "Offers waiting for your decision" section links to `/threads/${thread.id}` — correctly routes to the thread page, **not** to `/deal/...`.

---

## D3 — Exact File/Line Evidence

| What | File | Lines | Condition |
|------|------|-------|-----------|
| `isOwner` computed | `src/app/deal/[dealId]/page.tsx` | 49-51 | `grant.role === "OWNER" \|\| deal.owner_user_id === user.id` |
| `activeThread` fetched | `src/app/deal/[dealId]/page.tsx` | 93-100 | Selects `id, status` only, no `buyer_user_id` |
| `readOnly` passed | `src/app/deal/[dealId]/page.tsx` | 117 | `readOnly={!isOwner}` |
| ActiveThreadBanner rendered | `src/app/deal/[dealId]/page.tsx` | 123-128 | `{activeThread && <ActiveThreadBanner ...>}` — no role check |
| Banner shows/hides | `src/components/deal/ActiveThreadBanner.tsx` | 37 | `threadStatus !== "pending_owner"` only — no role check |
| Title input disabled | `src/components/deals/DealHeader.tsx` | 203 | `disabled={readOnly}` |
| Add property disabled | `src/components/deals/DealHeader.tsx` | 211 | `disabled={readOnly}` |
| Save disabled | `src/components/deals/DealHeader.tsx` | 221 | `disabled={readOnly}` |
| Submit Offer disabled | `src/components/deals/DealHeader.tsx` | 230 | `disabled={!canMakeOffer}` (factors in `hasActiveThread`) |
| Accept/Reject rendered | `src/components/threads/ThreadActionPanel.tsx` | 116-136 | `isOwner && proposalStatus==="submitted" && threadStatus==="pending_owner"` |
| ThreadActionPanel used | `src/components/threads/ThreadDetailView.tsx` | 173-178 | Inside `/threads/[threadId]` page only |
| Owner fallback redirect | `src/app/deal/[dealId]/page.tsx` | 263-264 | `redirect(/threads/${threadId})` — **dead code** since owner now has OWNER grant |

---

## D4 — Diagnosis

### Root cause: Both buyer and homeowner have `role=OWNER` grants

The `submit-offer` route mints an OWNER grant for the homeowner (`0faf6e11`). The buyer (`cee2ecc6`) already had an OWNER grant from deal creation. The deal page computes `isOwner = grant.role === "OWNER" || deal.owner_user_id === user.id`. Since **both** users satisfy `role === "OWNER"`, the page treats **both** as the owner.

### Regression 1: Buyer can still edit title/property after offer is submitted
**Why:** `readOnly={!isOwner}` → isOwner=true for buyer → readOnly=false. The `hasActiveThread` flag on line 173 of DealHeader only gates the "Submit Offer" button, not the title input, Save, or Add property buttons.

**Fix needed:** When `activeThread` is present and status is `pending_owner`, the buyer's title/save/add-property controls should be disabled. This requires either:
- (a) Passing `activeThread` awareness into the disabled condition for those controls, OR
- (b) Distinguishing buyer from owner (the buyer is `deal_threads.buyer_user_id`, the owner is `deals.owner_user_id`)

### Regression 2: Homeowner sees Withdraw Offer banner
**Why:** `ActiveThreadBanner` renders unconditionally when `activeThread` is non-null (line 123-128 in page.tsx). The component has zero role awareness — no `isOwner`, `isBuyer`, or `userId` prop. It shows "Withdraw Offer" to **everyone** with access, including the homeowner.

**Fix needed:** ActiveThreadBanner must receive a role indicator (e.g. `isBuyer` or comparing `user.id` to `activeThread.buyer_user_id`). The banner should render only for the buyer. The page must fetch `buyer_user_id` from the thread query (currently only selects `id, status`).

### Regression 3: Homeowner does not see Accept/Reject on deal page
**Why:** Accept/Reject UI is in `ThreadActionPanel`, which is only rendered inside the `/threads/[threadId]` page. It was **never wired** into the `/deal/[dealId]` page. The original design (line 224-225) was to redirect owners to `/threads/${threadId}` via the owner fallback path (line 263-264). But since `submit-offer` now mints an OWNER grant for the homeowner, the homeowner resolves the deal via the primary RLS path (line 40), never reaching the fallback redirect.

**Fix needed:** Either:
- (a) Add `ThreadActionPanel` (or equivalent Accept/Reject controls) directly to the deal page for owners when `activeThread` is pending_owner, OR
- (b) Ensure the homeowner is redirected to `/threads/${threadId}` from the deal page when a pending_owner thread exists and the user is the property owner (not the buyer).

### Regression 4: Dashboard "Offers waiting" links correctly
**The dashboard link is NOT broken.** Lines 660-661 show `href={/threads/${thread.id}}`, which correctly routes to the thread page where `ThreadActionPanel` renders Accept/Reject. The user's report that "deal page" lacks decision actions is accurate — the deal page was never intended to host those controls, but the current flow doesn't redirect owners away from it.

### Missing discrimination: buyer vs. owner on the deal page
The page has only one binary: `isOwner` (true/false). Both the buyer and homeowner are `isOwner=true`. There is no `isBuyer` derivation. To distinguish them, the page needs to know the thread's `buyer_user_id` (add to the thread SELECT on line 94) or compare `user.id` against `deal.owner_user_id`.

Actually, `deal.owner_user_id` IS already fetched (line 36). The comparison `deal.owner_user_id === user.id` would identify the homeowner. But this value is used **only** as an OR fallback in the isOwner computation (line 51). A separate `isPropertyOwner` or `isBuyer` flag is derivable without any additional DB queries:
```
const isPropertyOwner = deal.owner_user_id === user.id;
const isBuyer = !isPropertyOwner && isOwner;  // has OWNER grant but is not the property owner
```

---

## D5 — Minimal Next-Run Implementation Allowlist

Based on evidence, these are the **only** files that need changes:

| File | Reason |
|------|--------|
| `src/app/deal/[dealId]/page.tsx` | (1) Add `buyer_user_id` to thread SELECT (line 94). (2) Derive `isBuyer` / `isPropertyOwner`. (3) Conditionally render ActiveThreadBanner only for buyer. (4) Either render owner decision controls inline OR redirect owner to `/threads/${threadId}`. (5) Lock title/save/add-property for buyer during pending_owner. |
| `src/components/deal/ActiveThreadBanner.tsx` | Add `isBuyer` prop (or `userRole` prop). Only render when user is the buyer. |
| `src/components/deals/DealHeader.tsx` | Accept `hasActiveThread` or `locked` prop to disable title/save/add-property during pending_owner state (for the buyer). |

### Optional (if inline owner decision is chosen over redirect):
| File | Reason |
|------|--------|
| `src/components/deal/OwnerDecisionPanel.tsx` (new) | Inline Accept/Reject for the homeowner on the deal page. Could reuse logic from `ThreadActionPanel`. |

### NOT needed:
- `src/components/threads/ThreadActionPanel.tsx` — already correct; used by thread page
- `src/app/dashboard/page.tsx` — links correctly to `/threads/...`
- Any API routes — backends for withdraw, owner-decision are already validated
- Any migration/SQL files
- Any property/resolve/header-persistence code

---

## Verification

```
$ npm run build → Compiled successfully, all routes, no errors.
```

---

## Files Changed

- `docs/submitted-offer-role-gating-regression.md` (this file — ALLOWLIST)

No other files were edited.
