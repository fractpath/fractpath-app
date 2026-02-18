# Red Flags (Pause & Escalate)

If any of the following appear in a ticket, PR summary, or agent explanation, pause review and request clarification.

## Security / Access
- “assumes trusted client”
- “temporarily disable RLS”
- “bypass auth”
- “admin override”
- “public endpoint” (for sensitive actions)
- “no auth required” (unless explicitly intended)

## Data / Privacy
- “store more data”
- “log request body”
- “save raw payload”
- “PII later”
- “we can redact later”
- “export user data”

## Product Intent Drift
- “improve UX”
- “enhance”
- “while I was here”
- “refactor broadly”
- “minor feature”
- “future-proofing” (without ticket scope)

## Technical Debt Signals
- “quick fix”
- “workaround”
- “hack”
- “TODO”
- “shouldn’t happen”
- “edge case”
- “probably fine”
