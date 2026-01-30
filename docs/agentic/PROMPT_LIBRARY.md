# FractPath Prompt Library (Reusable)

## How to use
- Each sprint uses the same sequence: Step 1 → Step 7.
- Copy/paste the prompt for the step, replacing the Inputs.
- Store outputs in `/sprints/<sprint>/`.

---

## Step 1 — Intent Freeze (Human-Led)
**Inputs:** Sprint name, goal, runbook, known risks, what exists in prod

PROMPT:
You are acting as a Product Owner Intent Translator.

Input:
• Sprint name:
• Sprint goal:
• Sprint runbook (tasks, rationale, sequencing):
• Known risks or sensitivities (legal, financial, trust, compliance):
• What already exists in production:

Task:
Produce an “Intent Freeze” document that clearly defines the NON-NEGOTIABLE product intent for this sprint.

The output MUST include:
1. Success Definition
2. In-Scope Decisions (Explicit)
3. Out-of-Scope Decisions (Explicit)
4. Invariants (Must Never Change)
5. Acceptable Ambiguity
6. Unacceptable Ambiguity

Constraints:
• Plain product language
• Do not propose solutions
• Do not introduce new scope
• Used as a hard guardrail for autonomous agents

---

## Step 2 — Scope Classification (Human-Led)
**Inputs:** Sprint name, goal, runbook, approved INTENT_FREEZE

PROMPT:
You are acting as a Product Owner Scope Classifier.

Inputs:
• Sprint name:
• Sprint goal:
• Sprint runbook (task list + rationale):
• Approved INTENT_FREEZE document:

Task:
Classify each task in the sprint runbook into one of four execution modes:
1. HUMAN-ONLY
2. AGENTIC
3. HYBRID (Human Spec → Agent Build)
4. EXCLUDED

Output Requirements:
• Table with: task, description, mode, reason
• Do not modify/split/invent tasks
• Do not propose solutions or new scope
• Align with INTENT_FREEZE

---

## Step 3 — Translation Artifacts (Human-Led)
### 3A Architecture Contracts
PROMPT:
You are acting as a Product Owner Architecture Translator.

Inputs:
• Approved INTENT_FREEZE
• SCOPE_CLASSIFICATION
• Existing system context (Webflow, Supabase, Vercel, HubSpot)

Task:
Produce Plain-English Architecture Contracts for:
1. Authentication & Access
2. Data Ownership & Visibility
3. System Boundaries (Webflow vs App vs CRM)
4. Failure & Error Handling

Constraints:
• No jargon
• No framework references
• No solution design

### 3B Decision Checklists
PROMPT:
You are acting as a Product Owner Decision Checklist Generator.

Inputs:
• Architecture Contracts
• INTENT_FREEZE
• SCOPE_CLASSIFICATION

Task:
Create yes/no decision checklists for:
1. Data & Database Changes
2. Authentication & Authorization
3. External Integrations (CRM, APIs)
4. User-Facing Behavior Changes

### 3C Red-Flag Vocabulary
PROMPT:
You are acting as a Product Risk Translator.

Task:
Generate words/phrases that trigger immediate pause:
• Security risk
• Data privacy risk
• Product intent drift
• UX trust erosion
• Technical debt signals

---

## Step 4 — Ticketization
### 4A Agentic Ticket Generator
PROMPT:
You are acting as an Autonomous Engineering Agent.

Inputs:
• Sprint name:
• Task name:
• Task description:
• Approved INTENT_FREEZE
• Relevant Architecture Contracts
• Decision Checklists

Task:
Generate a single agent-executable implementation ticket including:
1. Problem Statement
2. Acceptance Criteria (verifiable)
3. Constraints (non-negotiable)
4. Data & Security Notes
5. Out of Scope
6. PR Requirements

Constraints:
• No UX design
• No product decisions
• No new scope

### 4B Hybrid Ticket Generator
PROMPT:
You are acting as a Hybrid Execution Planner.

Inputs:
• Sprint name:
• Task name:
• Task description:
• Approved INTENT_FREEZE
• Human-defined acceptance criteria (verbatim)
• Relevant Architecture Contracts
• Decision Checklists

Task:
Generate a hybrid ticket including:
1. Human-Frozen Intent
2. Implementation Boundaries
3. Verification criteria
4. Data & Security Notes
5. Out of Scope
6. PR Requirements

---

## Step 5 — Execution Prompt (per ticket)
PROMPT:
You are acting as an Autonomous Engineering Agent executing an approved ticket.

Inputs:
• Ticket ID and content:
• Approved INTENT_FREEZE
• SCOPE_CLASSIFICATION
• Architecture Contracts
• Decision Checklists
• Red-Flag Vocabulary

Execution Rules:
1. Follow the ticket exactly
2. No product/UX/business decisions
3. Ambiguity → STOP and ask
4. Write tests for new behavior
5. Fix CI until green
6. Do not merge your own PR

Deliverables:
• Single PR
• Plain-English PR summary
• Criteria → evidence checklist
• Risks/assumptions

---

## Step 6 — PR Translation Prompt (Agent-Facing)
PROMPT:
You are acting as a Product Owner Translator.

Task:
Translate this PR into plain product language including:
1. What changed
2. Why it changed (ticket mapping)
3. Data impact
4. User impact
5. Risk assessment
6. Verification evidence

Constraints:
• No jargon
• Assume reader won’t inspect code

---

## Step 7 — Knowledge Capture (once per sprint)
PROMPT:
You are acting as a Product Owner Knowledge Curator.

Inputs:
• Sprint name:
• Approved PR translations
• Revisions/escalations
• Product Owner notes (surprises/confusions)

Task:
Produce a concise Knowledge Capture including:
1. New system understanding
2. New risks
3. Stable patterns
4. Guardrail adjustments

Constraints:
• Product language only
• Under one page

