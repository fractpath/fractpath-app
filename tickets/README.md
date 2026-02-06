# Tickets — fractpath-app

## Folder conventions

| Folder         | Purpose                                  |
|----------------|------------------------------------------|
| `tickets/APP/` | Product / application feature tickets    |
| `tickets/OPS/` | Ops, infrastructure, and tooling tickets |

## Naming conventions

- **App tickets**: `APP-###-short-slug.md` (e.g. `APP-001-secure-portal-onboarding.md`)
- **Ops tickets**: `OPS-###-short-slug.md` (e.g. `OPS-001-backoffice-crm.md`)
- Numbers are zero-padded to three digits.
- Slugs use lowercase kebab-case.

## Status workflow

Each ticket should include a `Status` field near the top with one of:

| Status         | Meaning                                      |
|----------------|----------------------------------------------|
| `draft`        | Scoped but not yet started                   |
| `in-progress`  | Actively being worked on                     |
| `done`         | Completed and merged                         |

## Auth baseline rule

> **Do not change the auth baseline** (Supabase auth routes, session handling, cookies, `/auth/*`, `/api/me`) without a dedicated, reviewed ticket.

## Current ticket index

### APP (product)

| ID      | Title                                              | Status      |
|---------|----------------------------------------------------|-------------|
| APP-001 | Secure portal onboarding (profiles, roles, handoff)| in-progress |
| APP-002 | Scenario persistence + versioning                  | draft       |
| APP-003 | Deal workspace pairing                             | draft       |
| APP-004 | Documents — manual contract/title handoff           | draft       |
| APP-005 | Payments ledger, fees, commissions                 | draft       |
| APP-006 | Stripe payments (limited scope)                    | draft       |
| APP-007 | Email notifications, receipts, reminders           | draft       |
| APP-008 | Negotiation — counter-offers, term snapshots        | draft       |
| APP-009 | Contract packet generation + partner handoff       | draft       |
| APP-010 | In-app messaging (structured)                      | draft       |
| APP-011 | Dashboard analytics — equity tracking               | draft       |
| APP-012 | Admin analytics — funnel metrics                    | draft       |
| APP-013 | AVM integration — valuation sources                 | draft       |

### OPS (infrastructure)

| ID      | Title                                              | Status      |
|---------|----------------------------------------------------|-------------|
| OPS-001 | Back-office workflow + CRM discipline (manual-first)| draft      |
| OPS-003 | Data retention, privacy, compliance (MVP-safe)     | draft       |
