TICKET APP-001 — Secure portal onboarding (profiles, roles, scenario handoff)
Ticket ID

APP-001

Title

Secure portal onboarding: profiles, roles, and scenario handoff (manual-first)

Objective

Create the first logged-in experience at app.fractpath.com that allows users to:

create a secure profile

select their role (Homeowner, Buyer, Realtor)

claim scenarios generated on the marketing site

view a clean, read-only dashboard of their information

This portal is not yet transactional.
It exists to establish identity, continuity, and trust — and to reduce off-platform leakage.

Non-goals

No payments

No contract execution

No in-app messaging

No document upload

No Zillow / AVM integration

No SMS verification (email-only for now)

Preconditions

Marketing site live at fractpath.com

Calculator generates scenario payloads

HubSpot lead capture working

OPS-001 back-office workflow documented

Subdomain app.fractpath.com available

Core Design Principle (important)

The portal should feel real and trustworthy, even if much of the work is still manual behind the scenes.

Users should believe:

“My data is safe”

“My scenario didn’t disappear”

“This is progressing somewhere structured”

Implementation Requirements
A) Authentication (Phase 1: email-based only)

Use a simple, reliable auth system suitable for a solo builder.
(Implementation choice left flexible for your stack: Supabase Auth, Clerk, or equivalent.)

Requirements:

Email + password

Email verification required before access

Password reset flow

No SMS verification yet

Routes:

/signup

/login

/forgot-password

CTA links from marketing already point to:

https://app.fractpath.com/signup?persona=buyer|homeowner|realtor


Persona param should pre-select role where possible.

B) Profile creation (first-login flow)

On first successful login:

Prompt user to:

confirm email

select role (if not pre-filled)

Store profile with:

email

role

created_at

source = marketing

Show short “What happens next” explanation

No additional personal data required yet.

C) Scenario handoff from marketing → portal

This is critical for continuity.

Mechanism (MVP-safe approach)

When a user submits email on marketing:

Scenario already exists in HubSpot

Portal does not need to store full scenario yet

In the portal:

Fetch basic scenario summary from HubSpot by email (manual or API)

OR show a placeholder:

“We’ve saved your scenario. A FractPath team member will help refine it with you.”

Important:
Do NOT promise real-time syncing yet.
The portal should acknowledge the scenario, not recreate it perfectly.

D) Dashboard (read-only, credibility-focused)

Create a simple dashboard:

Route:

/dashboard


Layout sections:

Welcome header

“Welcome to FractPath”

Persona-specific subtext

Your scenario

Short summary (text-based)

Key highlights:

property value

upfront/monthly inputs

horizon

Status badge:

“Scenario saved”

“In review”

“Next steps scheduled”

What happens next

Persona-specific steps:

Homeowner: intro call, appraisal, title partner

Buyer: refine terms, homeowner match

Realtor: beta onboarding, referral setup

Support

“Contact FractPath”

Mailto or form

Emphasize human support

No editing yet.
This is read-only.

E) Role-specific language (no branching logic yet)

The portal should:

show different copy per role

NOT show different functionality per role (yet)

Examples:

Homeowner: “You’re exploring a new way to unlock equity without a loan.”

Buyer: “You’re modeling a pathway to ownership through shared equity.”

Realtor: “You’re participating as a referral and co-pilot.”

This reinforces positioning without added complexity.

F) Security + trust signals

Even in MVP:

HTTPS enforced

Auth-protected routes

Clear “You’re in a secure environment” language

Basic privacy note

No need for SOC language or certifications yet.

Acceptance Criteria (Definition of Done)

User can sign up, verify email, log in

Persona is captured and stored

User lands on a dashboard after login

Dashboard references their scenario (even if placeholder)

Portal feels stable and intentional

No broken flows from marketing → portal

No sensitive actions exposed

QA Checklist

 Signup link with persona param works

 Login/logout works

 Password reset works

 Dashboard renders for all 3 personas

 No blank states that feel broken

 Mobile usable

Deliverables

Auth setup

Profile storage

Dashboard UI

Role-aware copy

Scenario acknowledgment logic
