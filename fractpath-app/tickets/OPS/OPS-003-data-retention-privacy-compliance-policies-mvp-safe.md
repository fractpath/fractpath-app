TICKET OPS-003 — Data retention, privacy, and compliance policies (MVP-safe)
Ticket ID

OPS-003

Title

Data retention, privacy posture, and compliance guardrails (MVP, U.S.-only)

Objective

Define and document a clear, defensible data and compliance posture for FractPath that:

protects users’ sensitive financial and property information

limits legal exposure during MVP and beta

aligns product behavior with stated policies

is simple enough to implement without a legal ops team

scales cleanly as automation increases

This ticket is about policy + alignment, not code-heavy compliance systems.

Non-goals

No SOC 2 / ISO certification

No full Reg Z / TILA compliance framework

No automated data deletion tooling

No international (GDPR) posture yet

No tax reporting workflows

Preconditions

OPS-001 back-office workflow exists

APP-001–APP-012 implemented or planned

You are operating U.S.-only, Maryland-first

Platform is positioned as not a lender, not a broker-dealer

Core Compliance Posture (important)

FractPath is a record-keeping and facilitation platform for shared-equity agreements between private parties.
It does not make loans, extend credit, or provide legal advice.

All policies should reinforce this positioning.

Implementation Requirements
A) Data classification (what you store)

Create a document:

docs/ops/data-classification.md


Define and list the categories of data you store:

1) Public / Marketing

Email (marketing leads)

Persona selection

Calculator inputs (non-binding)

2) Account / Identity

Email

Name (limited)

Role (buyer/homeowner/realtor)

Login credentials (handled by auth provider)

3) Deal Data (Sensitive)

Property address

Scenario inputs/outputs

Accepted terms

Messages

Ledger entries

Documents (appraisal, contracts, title reports)

4) Payments Metadata

Stripe IDs

Payment status

Amounts

Dates
(No card or bank details stored)

Explicitly state:

What FractPath does not store (SSNs, bank account numbers, credit scores in MVP)

B) Data retention policy (MVP defaults)

Create:

docs/ops/data-retention-policy.md


Recommended MVP policy:

Accounts & Deals

Retained for 7 years after deal EXITED

Rationale: contract disputes, audit trail, tax questions

Scenarios (no deal created)

Retained for 24 months

Then eligible for deletion/anonymization

Messages & Events

Retained for 7 years if tied to a deal

Otherwise 24 months

Marketing leads (HubSpot)

Governed by HubSpot retention + unsubscribe rules

Documents

Retained with deal record (7 years)

Stored privately, access logged

Document:

Who can request deletion

What deletion means (soft delete vs anonymization)

That deletion may be limited by legal obligations

C) Privacy policy alignment (public-facing)

Create a checklist doc:

docs/ops/privacy-policy-alignment.md


Ensure your Privacy Policy (even if drafted later) will state:

What data is collected

Why it’s collected

Who it’s shared with (e.g., Stripe, AWS, title partners)

That FractPath does not sell personal data

That FractPath does not provide legal or financial advice

How users can contact you about data questions

For MVP:

Link to a simple privacy policy page (even if minimal)

Add footer links on marketing + app

D) Compliance guardrails in product language

Audit product copy and confirm these rules:

Always say “Scenario” or “Terms Summary”

Not “Offer”

Not “Commitment”

Not “Guaranteed return”

Disclaimers must appear:

On calculator outputs

On terms negotiation pages

On contract packet summaries

Role clarity

Realtors are “referrers / co-pilots”

FractPath is a facilitator + record keeper

Title/legal partners handle closing mechanics

Document these in:

docs/ops/compliance-language-guidelines.md

E) Access controls & auditability

Document and confirm:

Only authenticated users can access deal data

Only deal participants can view deal content

Admin access is limited and logged

All mutations create immutable audit events

Documents are private by default

Create:

docs/ops/access-and-audit-controls.md


This becomes your “answer” if a lawyer or partner asks how data is protected.

F) Third-party risk inventory

Create:

docs/ops/vendor-inventory.md


List:

AWS (hosting, SES, storage)

Stripe (payments)

HubSpot (CRM)

Plausible (analytics)

Vercel (deployment)

Title partners (Eagle Title, etc.)

For each:

Data shared

Purpose

Risk level (Low / Medium)

Notes

This is lightweight but extremely credibility-boosting.

G) User support + incident response (MVP)

Document a simple process:

docs/ops/support-and-incident-response.md


Include:

Support contact email

Response time target

What qualifies as a “data incident”

Who is notified (you)

How issues are logged

No automation required—just clarity.

Acceptance Criteria (Definition of Done)

Data categories clearly documented

Retention timeframes defined and reasonable

Privacy policy expectations documented

Product language guardrails documented

Access and audit controls documented

Vendor inventory exists

Support + incident response defined

No contradiction between product behavior and stated policies

QA Checklist (self-audit)

 Could I explain this to a lawyer in 10 minutes?

 Does product language match policy language?

 Do I know where sensitive data lives?

 Can I confidently say what we don’t store?

 Could I respond to a data deletion request?

If yes → you’re in a strong MVP posture.

Deliverables

docs/ops/data-classification.md

docs/ops/data-retention-policy.md

docs/ops/privacy-policy-alignment.md

docs/ops/compliance-language-guidelines.md

docs/ops/access-and-audit-controls.md

docs/ops/vendor-inventory.md

docs/ops/support-and-incident-response.md
