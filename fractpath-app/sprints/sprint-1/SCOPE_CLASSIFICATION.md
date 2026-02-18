| Task | Short Description | Execution Mode | Reason |
|---|---|---|---|
| Define minimum intake fields | Decide minimal inputs required for meaningful summary | HUMAN-ONLY | Product meaning / semantics |
| Define canonical summary rules | Decide what summary must include and forbidden language | HUMAN-ONLY | Prevent semantics drift and legal risk |
| Scaffold minimal app skeleton | Create server-capable app structure | AGENTIC | Execution-only |
| Build server-side summary generator | Implement generator exactly per human rules | HYBRID | Human defines content; agent codes |
| Build intake form UI | Simple form to collect fields | AGENTIC | Execution-only within defined fields |
| Implement HubSpot write | Server-side API to write property | AGENTIC | Integration plumbing |
| Failure handling + verification | Explicit errors + basic smoke test | AGENTIC | Execution-only safety |
| Document end-to-end flow | How to test and verify | AGENTIC | Documentation |
