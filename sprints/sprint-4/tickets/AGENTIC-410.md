AGENTIC-410
Chaos Tests — Constitutional Proof
Intent Freeze

Sprint 4 complete only if system resists:

Double counters

Stale authorization

Role misuse

Rapid state racing

Required Tests

Two buyer counters within 50ms → 2 versions.

Buyer attempts authorization → exception.

Homeowner authorizes stale version → rejected.

Buyer accept after withdrawal → rejected.

Rapid accept + counter → deterministic ordering.

Exit Criteria

All tests deterministic and auditable.
