# HYBRID-002 — Canonical Scenario Summary Generator

## Problem Statement
We need a single authoritative server-side generator for `fractPathScenarioSummary`.

## Human-Frozen Inputs
- Follow rules in HUMAN-001 exactly
- Do not add or infer data
- Do not change meaning

## Acceptance Criteria
- Generator lives server-side
- All submissions use this generator
- Output is non-empty when inputs are valid
- Output includes required disclaimer line

## Constraints
- No client-side generation
- No logging of raw sensitive values

## Out of Scope
- Calculations
- Validation beyond presence checks

## PR Requirements
- Map input fields → summary output explicitly
