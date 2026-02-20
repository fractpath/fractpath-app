# SPRINT 10 — AGENT-010
Duration Yield Floor (Ceiling Compression Protection)

Repository: fractpath-calculator-widget  
Depends On:
- docs/financial-core/sprint-10-compute-spec.md
- docs/tickets/SPRINT-10-AGENT-001-canonical-compute.md
- packages/compute (computeDeal, types, tests)

Status: Ready after AGENT-001 merges/tests pass

---

# Objective

Add a duration-based minimum return protection to prevent ceiling compression from producing unattractive long-duration outcomes.

This feature ensures that if a deal persists beyond a configured time threshold, the investor’s settlement is floored at a minimum return multiple, even if the ceiling_multiple is low and/or timing_factor_late is insufficient.

This is designed to protect investor duration risk without changing the core floor/ceiling mechanics for typical exits.

---

# New Input (DealTerms)

Add optional terms:

```ts
duration_yield_floor_enabled: boolean

// first milestone in years after which a minimum multiple is enforced
duration_yield_floor_start_year: number | null

// minimum settlement multiple applied when exit_year >= start_year
duration_yield_floor_min_multiple: number | null
Defaults:

enabled = false

start_year = null

min_multiple = null

Compute Logic Changes
Settlement Clamp Order (canonical)
Existing core logic:

isa_pre_floor_cap = IBA + (gain × TF)

if HARD_FLOOR: clamp between [IBA×FM, IBA×CM]

if NO_FLOOR: cap at IBA×CM only

Add duration yield floor after standard floor/cap is computed:
Let:

ISA_standard = settlement after applying DownsideMode and ceiling_multiple as currently implemented.

DYF_floor_amount = IBA × duration_yield_floor_min_multiple

If duration_yield_floor_enabled AND exit_year >= duration_yield_floor_start_year:

ISA_with_dyf = MAX(ISA_standard, DYF_floor_amount)
Else:

ISA_with_dyf = ISA_standard
Important constraints:

DYF must NOT apply before the start year.

DYF must be deterministic and rounded per rounding policy.

DYF should be compatible with HARD_FLOOR and NO_FLOOR.

DYF is a “duration protection floor” and may exceed ceiling_multiple outcomes (that is the point).

If enabled, DYF becomes the effective minimum settlement beyond the start year.

Type + Spec Updates
Update packages/compute/src/types.ts DealTerms

Update docs/financial-core/sprint-10-compute-spec.md to include the new fields and clamp rule

Update any fixtures / parity tests impacted

Tests Required
Add unit tests verifying:

DYF disabled → no change to settlement

DYF enabled but exit_year < start_year → no change

DYF enabled and exit_year >= start_year:

if ISA_standard < IBA×min_multiple → settlement raised to DYF

if ISA_standard >= IBA×min_multiple → unchanged

Works under:

HARD_FLOOR mode

NO_FLOOR mode

Ensure IRR reflects updated cashflow settlement

Out of Scope
Multi-step schedules (year 5, year 10 ladders) — see “Future Enhancements”

UI dropdowns/t-shirt sizing (future sprint)

Contract enforcement logic

Future Enhancements (Not for this ticket)
If product needs ladders:
Replace single DYF with an ordered schedule:

duration_yield_floor_schedule?: Array<{
  start_year: number
  min_multiple: number
}>
Compute:

find the highest applicable start_year <= exit_year

apply its min_multiple

This should only be built if a single milestone proves insufficient.

Definition of Done
AGENT-010 is complete when:

DealTerms includes DYF fields

computeDeal applies DYF rule deterministically

Unit tests cover DYF scenarios

Docs updated to reflect DYF

No regression in existing tests/parity

End of Ticket

---

## Answer to your “multiple time intervals” question

### Start simple (recommended)
**One milestone** is enough to solve 90% of the ceiling-compression pain:
- “If you’re still in after year 15, investor minimum is 1.5x.”

It’s easy to explain, easy to test, and avoids product overfitting.

### When to add a ladder
Add step-up multiples only if you *know* you need it (e.g., investor feedback or underwriting model requires it). If/when you do, implement as a **schedule array** (as included in “Future Enhancements”), not as separate fields for year5/year10/year15.
