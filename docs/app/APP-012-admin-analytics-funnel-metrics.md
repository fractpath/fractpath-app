TICKET APP-012 — Admin analytics + funnel metrics (ops-first, decision-ready)
Ticket ID

APP-012

Title

Admin analytics: funnel health, deal velocity, revenue signals, and risk flags

Objective

Provide FractPath admins with a single admin-only analytics view to understand:

top-of-funnel performance (leads → scenarios → deals)

deal progression and bottlenecks

revenue signals (planned vs paid)

realtor contribution and ROI

operational risk flags (stale deals, unpaid fees)

This is not a customer-facing dashboard. It is a control panel for running the business.

Non-goals

No external BI tools (Looker, Metabase, etc.)

No forecasting beyond simple aggregates

No cohort analysis by geography yet

No investor reporting

No CSV exports (optional later)

Preconditions

Marketing events tracked (Plausible + HubSpot)

APP-002 scenarios exist

APP-003 deals exist with statuses

APP-005 ledger exists

APP-007 email events logged

APP-010 messages logged

Admin role exists

Core Design Principles

Decision over decoration — show what matters

Counts before charts — simple numbers first

Actionable flags — highlight where to intervene

One screen — no drill-down maze for MVP

Implementation Requirements
A) Admin-only route + access control

Create route:

/admin/analytics


Rules:

Only accessible to users with fractpath_admin role

No accidental exposure via navigation

Hard redirect if unauthorized

B) Funnel overview (top of page)

Display a simple funnel with counts:

Marketing → Product

Leads captured (HubSpot count, or mirrored)

Scenarios created

Portal signups

Scenarios imported into portal

Product → Deals

Deals created

Deals connected

Deals with accepted terms

Deals contracted (manual)

Deals active

Deals exited

Each stage shows:

count

% conversion from previous stage

Microcopy:

“Counts reflect system-of-record data only.”

C) Deal velocity + bottlenecks

Create a table or cards showing:

Average time:

Scenario → Deal created

Deal created → Connected

Connected → Terms accepted

Accepted → Contracted

Current deals by status:

DRAFT

INVITED

CONNECTED

TERMS_SHAPING

PRE_CONTRACT

CONTRACTED_MANUAL

ACTIVE

EXITED

Highlight in yellow/red:

deals in the same status > X days (configurable, default 14)

D) Revenue signals (ledger-based)

Aggregate from ledger_entries:

Show totals:

Planned revenue

Due revenue

Paid revenue

Waived revenue

Break down by type:

Platform fees

Outreach fees

Servicing fees

Exit fees (planned vs realized)

Show:

Total collected to date

Outstanding due amounts

Microcopy:

“Amounts reflect ledger entries, not bank balances.”

E) Realtor performance snapshot

Show:

Number of deals involving a realtor

Total commission planned

Total commission paid

Top 3 realtors by projected commission

Optional:

Avg time to connect when realtor involved vs not

This helps you decide:

who to invite into beta

who to prioritize for partnerships

F) Risk & attention flags (actionable list)

Create a “Needs attention” section:

Flag deals where:

Invite sent but not accepted in > 7 days

Deal CONNECTED but no terms version in > 10 days

Terms accepted but no packet sent

Ledger entries DUE but unpaid in > 5 days

Exit event recorded but exit fees not finalized

Each flag should:

link directly to the deal

state what’s missing

suggest next action

G) Minimal charts (optional, keep light)

Optional small charts:

Deals by status (bar)

Revenue by type (bar)

Avoid time-series complexity for MVP.

H) Data freshness + caveats

At bottom of page:

“Last updated: {timestamp}”

Short note:

“Analytics reflect internal system data and may not include off-platform actions.”

Acceptance Criteria (Definition of Done)

Admin-only analytics route exists

Funnel counts render correctly

Deal status distribution visible

Revenue aggregates match ledger data

Realtor snapshot renders when data exists

Attention flags correctly identify stalled or risky deals

No non-admin user can access analytics

Page loads without noticeable delay

QA Checklist

 Counts reconcile with raw tables

 Flag thresholds configurable in code

 No PII leakage in aggregate views

 Mobile view readable (admin likely desktop, but still usable)

 Unauthorized access blocked

Deliverables

/admin/analytics page

Funnel aggregation logic

Deal velocity metrics

Revenue aggregation logic

Risk/attention flag generator

Admin-only navigation entry (or hidden link)
