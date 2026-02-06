TICKET APP-011 — Dashboard analytics + value tracking (equity over time)
Ticket ID

APP-011

Title

Dashboard analytics: equity growth, value tracking, and lifecycle insights (read-only)

Objective

Provide Buyer, Homeowner, Realtor, and FractPath Admin with clear, confidence-building analytics that show:

how equity has accumulated over time

how current value compares to original terms

what early / standard / late exit would look like today

how fees and commissions accrue over time (read-only)

This dashboard reinforces the long-term value proposition and reduces “what happens next?” anxiety.

Non-goals

No real-time market feeds (Zillow/AVM later)

No forecasting beyond existing calculator logic

No editable assumptions (read-only for MVP)

No performance benchmarking vs other assets

No investor marketplace analytics

Preconditions

APP-002 scenario persistence exists

APP-005 ledger exists

APP-008 accepted terms exist for some deals

Deal status is at least ACTIVE or PRE_CONTRACT (dashboard still visible earlier, but limited)

Core Design Principles

Read-only, confidence-first analytics

Grounded in accepted terms + recorded payments

Explain variance clearly (time, value, fees)

No “surprise math” — show inputs alongside outputs

Implementation Requirements
A) Analytics data inputs (single source of truth)

Analytics must derive only from:

Accepted deal_term_versions

ledger_entries (paid + planned)

Scenario computation logic (already implemented)

Time elapsed since deal start

No new calculation logic should be introduced here—reuse existing formulas.

B) Dashboard sections (Deal Workspace → Analytics tab)

Add a new tab to /deals/[id]:

Analytics

1) Equity Over Time (primary visual)

Chart:

X-axis: time (months or years since start)

Y-axis: equity % owned by Buyer vs Homeowner

Data:

upfront equity

installment-accrued equity

current vested equity

remaining homeowner equity

Annotations:

“You are here” (current date)

CPW start / CPW end markers

2) Value snapshot (today)

Cards showing:

Current estimated FMV

(derived from starting value + appreciation assumption)

Buyer vested equity %

Buyer implied equity value

Homeowner remaining equity value

Microcopy:

“Values shown are estimates based on agreed assumptions. Final value determined at settlement.”

3) Exit scenario comparison (today)

Table with three columns:

Scenario	Buyer Payout	Homeowner Net	Notes
Early Exit	$	$	Discount applied
Standard Exit	$	$	Base terms
Late Exit	$	$	Premium applied

Rules:

FMV is the same across scenarios (same “today” value)

TF only affects payout, not property value

Floors / ceilings visibly applied with badges

4) Fees & commissions (read-only)

Show:

Platform fees paid to date

Servicing fees accrued

Exit fee (planned)

Realtor commissions:

earned

projected at exit

For Realtors:

Highlight “Your projected total commission”

5) Activity + lifecycle indicators

Small indicators:

Deal age

Time until CPW start/end

Last activity

Next expected milestone

C) Persona-specific views

Buyer

Emphasize:

equity gained

implied purchase price vs FMV

long-term upside

De-emphasize:

operational fees not paid by buyer

Homeowner

Emphasize:

cash received to date

remaining equity

net proceeds at exit

De-emphasize:

buyer ROI framing

Realtor

Emphasize:

commission timeline

deals in progress

total projected earnings

Admin

Full visibility

D) “What changed?” explanations

When numbers change (e.g., month rollover):

Show a subtle explanation:

“Equity increased due to monthly contribution.”
“Estimated value increased due to time-based appreciation.”

No notifications required yet—just clarity.

E) Export / sharing (optional MVP-lite)

Optional button:

“Download snapshot (PDF)” → not implemented

Instead show:

“Exporting available in a future update.”

(Do not overbuild.)

Acceptance Criteria (Definition of Done)

Analytics tab exists in Deal Workspace

Equity-over-time chart renders correctly

Value snapshot reflects accepted terms + time elapsed

Exit scenario table applies TF without changing FMV

Fees and commissions are correctly aggregated from ledger

Views adapt by persona (copy + emphasis)

No editable fields exposed

Mobile view remains readable

QA Checklist

 Equity % never exceeds 100%

 Buyer + Homeowner equity always sum to 100%

 FMV consistent across exit scenarios

 Floor / cap visibly applied when binding

 No NaN / undefined values when deal is early-stage

 Charts update when time advances

Deliverables

Analytics tab UI

Equity-over-time chart component

Exit scenario comparison table

Fee & commission summary components

Persona-aware copy variants
