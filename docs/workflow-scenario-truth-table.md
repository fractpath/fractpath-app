# Workflow Scenario Truth Table

Canonical reference for the unhappy-path (ineligible / void) deal scenarios.
All scenarios assume the ATTOM-first policy is active.

---

## Key symbols
| Symbol | Meaning |
|--------|---------|
| ✅ | Present / true / passes |
| ❌ | Absent / false / blocked |
| — | Not applicable / does not render |

---

## State variables (inputs to scenario)

| Variable | Values |
|----------|--------|
| `deal.triage_status` | `ineligible` \| `ready_for_deposit` \| … |
| `property.escalation_avm_status` | `null` \| `in_progress` \| `completed` |
| `effectiveThread.status` | `accepted` \| `negotiating` \| `pending_owner` \| `closed` |
| `negState.currentProposal` | object with `.id` + `.terms_snapshot` \| `null` |
| `deal.renegotiation_status` | `null` \| `requested` |
| viewer | `owner` \| `buyer` \| `shared` |

---

## Scenario A — Deal is eligible (healthy happy path)

**State:** `triage_status = ready_for_deposit`, `avm = completed`, thread = `accepted`

| Control | Expected |
|---------|----------|
| `showIneligibleBlock` | ❌ |
| `showVoidOwnerCounterUi` | ❌ |
| `AttomRequiredDealOwnerBlock` | — |
| `IneligibleDealOwnerBlock` | — |
| `VoidOwnerCounterSection` | — |
| `IneligibleDealBuyerBlock` | — |
| `AcceptedPendingReviewBanner` | ✅ (or hero label if stage > 2) |
| `editingLocked` | ✅ (happy path locked) |
| `DealDetailWidgetPanel canEdit` | ❌ |

---

## Scenario B — Deal ineligible, ATTOM not yet complete (attom_required stage)

**State:** `triage_status = ineligible`, `avm ≠ completed`, thread = `accepted`, viewer = owner

| Control | Expected |
|---------|----------|
| `showIneligibleBlock` | ✅ |
| `canonicalResult.stage` | `attom_required` |
| `showVoidOwnerCounterUi` | ❌ (gated: `currentStage !== "attom_required"` fails) |
| `AttomRequiredDealOwnerBlock` | ✅ |
| `IneligibleDealOwnerBlock` | ❌ |
| `VoidOwnerCounterSection` | ❌ |
| `editingLocked` | ❌ (void unlock) |
| Happy-path execution copy | ❌ |

---

## Scenario C — Deal ineligible, ATTOM not yet complete (attom_required stage), viewer = buyer

**State:** `triage_status = ineligible`, `avm ≠ completed`, thread = `accepted`, viewer = buyer

| Control | Expected |
|---------|----------|
| `showIneligibleBlock` | ✅ |
| `AttomRequiredDealBuyerBlock` | ✅ |
| `AttomRequiredDealOwnerBlock` | ❌ |
| `VoidOwnerCounterSection` | ❌ |
| Owner-only controls visible | ❌ |

---

## Scenario D — Deal ineligible, ATTOM complete, no prior proposal (owner sees intent block only)

**State:** `triage_status = ineligible`, `avm = completed`, thread = `accepted`,
`negState.currentProposal = null`, viewer = owner

| Control | Expected |
|---------|----------|
| `showIneligibleBlock` | ✅ |
| `canonicalResult.stage` | `deal_terms_ineligible` or `renegotiation_requested` |
| `showVoidOwnerCounterUi` | ❌ (`negState.currentProposal` is null) |
| `IneligibleDealOwnerBlock` | ✅ (intent log + appraisal info) |
| `VoidOwnerCounterSection` | ❌ |
| `editingLocked` | ❌ (void unlock) |
| `DealDetailWidgetPanel canEdit` | ✅ (owner, not locked) |

---

## Scenario E — **KEY** Deal ineligible, ATTOM complete, prior proposal exists, viewer = owner

**State:** `triage_status = ineligible`, `avm = completed`, thread = `accepted`,
`negState.currentProposal` exists (status = `accepted`), `renegotiation_status = null`, viewer = owner

| Control | Expected |
|---------|----------|
| `showIneligibleBlock` | ✅ |
| `canonicalResult.stage` | `deal_terms_ineligible` |
| `showVoidOwnerCounterUi` | ✅ |
| `IneligibleDealOwnerBlock` | ✅ (shown alongside) |
| `VoidOwnerCounterSection` | ✅ — "Propose revised terms" button visible |
| `editingLocked` | ❌ (void unlock) |
| `DealDetailWidgetPanel canEdit` | ✅ |
| Happy-path copy / AcceptedPendingReviewBanner | ❌ (isExceptionState suppresses) |
| Signature / closing progression | ❌ (blocked by exception state + void unlock) |

**Counter flow API path:**
- Owner clicks "Propose revised terms" → `CounterOfferModal` opens
- On save → `POST /api/proposals/[acceptedProposalId]/counter`
- Server: `isVoidIneligibleCounter = true` (proposal.status = "accepted")
- Server: verifies `deal.triage_status === "ineligible"` ✅
- Server: creates new proposal (status = `submitted`), old proposal → `withdrawn`, thread → `negotiating`
- Page refresh: `effectiveThread.status = "negotiating"` → `showIneligibleBlock` suppressed
- NegotiationSection activates for buyer to review the new counter

---

## Scenario F — Deal ineligible, ATTOM complete, renegotiation already requested, viewer = owner

**State:** `triage_status = ineligible`, `avm = completed`, thread = `accepted`,
`negState.currentProposal` exists, `renegotiation_status = requested`, viewer = owner

| Control | Expected |
|---------|----------|
| `canonicalResult.stage` | `renegotiation_requested` |
| `showVoidOwnerCounterUi` | ✅ (stage ≠ attom_required, proposal exists) |
| `IneligibleDealOwnerBlock` | ✅ (with `renegotiationAlreadyRequested = true`) |
| `VoidOwnerCounterSection` | ✅ — can still formally propose revised terms |

---

## Scenario G — Deal ineligible, ATTOM complete, prior proposal exists, viewer = buyer

**State:** `triage_status = ineligible`, `avm = completed`, thread = `accepted`, viewer = buyer

| Control | Expected |
|---------|----------|
| `showIneligibleBlock` | ✅ |
| `IneligibleDealBuyerBlock` | ✅ — "Accepted terms no longer valid — revised terms required" |
| `VoidOwnerCounterSection` | ❌ (owner-only) |
| `AttomRequiredDealBuyerBlock` | ❌ |
| Owner counter controls visible | ❌ |

---

## Scenario H — After void counter: thread becomes negotiating, deal still ineligible in DB

**State:** `triage_status = ineligible` (DB not yet updated), thread = `negotiating` (owner submitted revised terms)

| Control | Expected |
|---------|----------|
| `showIneligibleBlock` | ❌ (`effectiveThread.status === "negotiating"` suppresses) |
| `showVoidOwnerCounterUi` | ❌ |
| `VoidOwnerCounterSection` | ❌ |
| `IneligibleDealOwnerBlock` | ❌ |
| `IneligibleDealBuyerBlock` | ❌ |
| `showNegotiationUi` | ✅ (`negotiating`) — NegotiationSection active for buyer |
| `WaitingBanner` for owner sender | ✅ |
| Happy-path execution copy | ❌ (still triage_status=ineligible in canonicalResult) |

---

## Scenario I — Manual appraisal complete, FMV supersedes ATTOM, deal now eligible

**State:** `triage_status = ineligible` (stale), `manual_appraisal_status = complete`, `manual_appraisal_fmv` yields eligible result

| Control | Expected |
|---------|----------|
| `liveEligibilityResult` | `eligible` |
| `showIneligibleBlock` | ❌ (liveEligibilityResult = "eligible") |
| `VoidOwnerCounterSection` | ❌ |
| `IneligibleDealOwnerBlock` | ❌ |
| `editingLocked` | ✅ (reverts to standard thread lock) |
| `DealMilestoneTracker` | ✅ (if stage has customer label) |

---

## Scenario J — Counter route rejects healthy accepted deals (security guard)

**API call:** `POST /api/proposals/[acceptedProposalId]/counter` where `deal.triage_status ≠ ineligible`

| Check | Expected |
|-------|----------|
| `isVoidIneligibleCounter = true` | `true` (proposal status = accepted) |
| `voidCheckDeal.triage_status === "ineligible"` | ❌ |
| HTTP response | `409` — "deal is not ineligible" |
| New proposal created | ❌ |
| Thread status changed | ❌ |

---

## Scenario K — Counter route: owner counters their own accepted proposal (void path, owner was last sender)

**State:** `deal.triage_status = ineligible`, accepted proposal `created_by_user_id = owner`, viewer = owner

| Check | Expected |
|-------|----------|
| `isVoidIneligibleCounter = true` | `true` |
| `created_by_user_id === user.id` check | Skipped (void bypass) |
| HTTP response | `200` — new proposal created |
| Notes | Valid: in void/ineligible state, any party must be able to restart |

---

## Scenario L — Buyer sees "Revised terms being prepared" when renegotiation requested

**State:** `triage_status = ineligible`, `avm = completed`, `renegotiation_status = requested`, viewer = buyer

| Control | Expected |
|---------|----------|
| `canonicalResult.stage` | `renegotiation_requested` |
| `IneligibleDealBuyerBlock` condition | `stage !== "renegotiation_requested"` → ❌ (not rendered) |
| Displayed to buyer | Only owner's intent-log block is suppressed for buyer; canonical exception banner shows stage copy |

---

## Validation checklist

- [x] Accepted deal becomes ineligible under ATTOM → `VoidOwnerCounterSection` renders for owner (Scenario E)
- [x] Owner sees formal counter UI with "Propose revised terms" button (Scenario E)
- [x] Owner can enter revised terms via `CounterOfferModal` → `POST .../counter` succeeds (Scenario E)
- [x] Buyer / shared viewer does NOT see `VoidOwnerCounterSection` (Scenarios G, C)
- [x] Happy-path execution (AcceptedPendingReviewBanner, signature/closing) blocked while void/ineligible (Scenario E)
- [x] After void counter succeeds, ineligible blocks clear and NegotiationSection takes over (Scenario H)
- [x] Counter route rejects healthy accepted proposals (Scenario J)
- [x] ATTOM not yet complete → formal counter blocked, AttomRequired blocks shown (Scenario B)
- [x] Manual appraisal FMV supersedes stale ineligible → blocks clear entirely (Scenario I)
- [x] `pnpm -s tsc --noEmit` passes ✅
