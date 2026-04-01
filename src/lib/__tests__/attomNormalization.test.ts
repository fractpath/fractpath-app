/**
 * ATTOM enhanced screening normalizer — unit tests.
 *
 * These are pure unit tests: no network calls, no DB calls, no mocks required.
 * All inputs are in-process fixture objects.
 *
 * Coverage:
 *   1. Successful normalization (clean outcome, becameControlling=true)
 *   2. nextVerificationState mapping for all 6 outcome values
 *   3. FMV discrepancy severity → outcome mapping
 *   4. Debt discrepancy via home-equity signal
 *   5. Weak outcome when AVM value is absent
 *   6. Weak outcome when AVM confidence is low (wide spread)
 *   7. Disputed outcome when owner match fails (no property record)
 *   8. Disputed outcome when value discrepancy is blocking
 *   9. Cash cap policy — raw and policy-capped values
 *  10. becameControlling=false for non-clean outcomes
 *  11. limitingFactors populated correctly for significant/blocking discrepancies
 *  12. resolveNextVerificationState (all branches)
 */

import { describe, it, expect } from "vitest";
import { normalizeAttomScreening } from "../property-review/providers/attom/normalize";
import { resolveNextVerificationState } from "../property/screening";
import type { AttomRawComposite } from "../property-review/providers/attom/types";
import type { ScreeningAdapterContext } from "../property/screening";

// ────────────────────────────────────────────────────────────────────────────
// Test fixtures
// ────────────────────────────────────────────────────────────────────────────

function makeCleanRaw(avmValue: number = 500_000): AttomRawComposite {
  return {
    propertyDetail: {
      identifier: { attomId: 123456, apn: "123-45-678" },
      address: {
        line1: "123 Main St",
        locality: "Springfield",
        countrySubd: "IL",
        postal1: "62701",
      },
      summary: { proptype: "Single Family", yearbuilt: 2000 },
      owner: {
        owner1: { lastName: "Smith", firstNameAndMi: "Jane" },
        mailAddress: {
          line1: "123 Main St",
          city: "Springfield",
          state: "IL",
          zip: "62701",
        },
        corporateIndicator: null,
      },
    },
    avmDetail: {
      identifier: { attomId: 123456 },
      avm: {
        amount: {
          value: avmValue,
          low: avmValue * 0.95,
          high: avmValue * 1.05,
        },
      },
      homeEquity: {
        estEquity: avmValue * 0.6,
        estEquityPct: 60,
        estEstimatedValue: avmValue,
      },
    },
    fetchedAt: "2026-01-01T00:00:00.000Z",
  };
}

function makeContext(overrides: Partial<ScreeningAdapterContext> = {}): ScreeningAdapterContext {
  return {
    propertyId: "prop-test-001",
    ownerDeclaredDebt: 200_000,
    ownerStatedFmv: 490_000,
    currentControllingFmv: null,
    ownerUserId: "user-test-001",
    ...overrides,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// 1. Successful normalization — clean outcome
// ────────────────────────────────────────────────────────────────────────────

describe("normalizeAttomScreening — clean outcome", () => {
  it("returns outcome=clean when AVM is present, confidence is high, and discrepancies are within tolerance", () => {
    const raw = makeCleanRaw(500_000);
    const ctx = makeContext({ ownerDeclaredDebt: 200_000, ownerStatedFmv: 495_000 });
    const result = normalizeAttomScreening(raw, ctx);

    expect(result.outcome).toBe("clean");
    expect(result.provider).toBe("attom");
    expect(result.artifactType).toBe("enhanced_screening");
    expect(result.nextVerificationState).toBe("verified_for_deals");
  });

  it("sets becameControlling=true and controllingFmvCandidate to the AVM value on clean outcome", () => {
    const raw = makeCleanRaw(500_000);
    const ctx = makeContext();
    const result = normalizeAttomScreening(raw, ctx);

    expect(result.becameControlling).toBe(true);
    expect(result.controllingFmvCandidate).toBe(500_000);
  });

  it("populates ownerMatchResult.matched=true when propertyDetail is present", () => {
    const raw = makeCleanRaw(500_000);
    const ctx = makeContext();
    const result = normalizeAttomScreening(raw, ctx);

    expect(result.ownerMatchResult.matched).toBe(true);
    expect(result.ownerMatchResult.confidence).toBe("medium");
    expect(result.ownerMatchResult.ownerNameMatch).toBeNull();
    expect(result.ownerMatchResult.mailingAddressMatch).toBeNull();
  });

  it("computes rawEstimatedAvailableCash using default LTV (60%)", () => {
    const raw = makeCleanRaw(500_000);
    const ctx = makeContext({ ownerDeclaredDebt: 100_000 });
    const result = normalizeAttomScreening(raw, ctx);

    // 500_000 * 0.60 - 100_000 = 200_000
    expect(result.rawEstimatedAvailableCash).toBe(200_000);
  });

  it("caps fractpathEligibleCashCap at ATTOM_MAX_CASH_CAP default (250_000)", () => {
    // High-value property: raw cash > cap
    const raw = makeCleanRaw(1_000_000);
    const ctx = makeContext({ ownerDeclaredDebt: 0 });
    const result = normalizeAttomScreening(raw, ctx);

    // raw = 1_000_000 * 0.60 - 0 = 600_000 → capped at 250_000
    expect(result.rawEstimatedAvailableCash).toBe(600_000);
    expect(result.fractpathEligibleCashCap).toBe(250_000);
  });

  it("returns no limiting factors on a clean outcome", () => {
    const raw = makeCleanRaw(500_000);
    const ctx = makeContext({ ownerDeclaredDebt: 200_000, ownerStatedFmv: 495_000 });
    const result = normalizeAttomScreening(raw, ctx);

    expect(result.limitingFactors).toHaveLength(0);
  });

  it("evidenceLinks is empty and reviewNotes is a non-null explanatory string", () => {
    const result = normalizeAttomScreening(makeCleanRaw(), makeContext());
    expect(result.evidenceLinks).toHaveLength(0);
    // reviewNotes is now always populated with a plain-language interpretation
    // (buildReviewNotes always returns a string, never null)
    expect(typeof result.reviewNotes).toBe("string");
    expect(result.reviewNotes!.length).toBeGreaterThan(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 2. nextVerificationState mapping
// ────────────────────────────────────────────────────────────────────────────

describe("resolveNextVerificationState — all outcome branches", () => {
  it("clean → verified_for_deals", () => {
    expect(resolveNextVerificationState("clean")).toBe("verified_for_deals");
  });
  it("discrepancy → owner_clarification_required", () => {
    expect(resolveNextVerificationState("discrepancy")).toBe("owner_clarification_required");
  });
  it("disputed → manual_review_required", () => {
    expect(resolveNextVerificationState("disputed")).toBe("manual_review_required");
  });
  it("weak → manual_review_required", () => {
    expect(resolveNextVerificationState("weak")).toBe("manual_review_required");
  });
  it("stale → manual_review_required", () => {
    expect(resolveNextVerificationState("stale")).toBe("manual_review_required");
  });
  it("unsupported → ineligible", () => {
    expect(resolveNextVerificationState("unsupported")).toBe("ineligible");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 3. FMV discrepancy severity → outcome
// ────────────────────────────────────────────────────────────────────────────

describe("normalizeAttomScreening — FMV discrepancy outcomes", () => {
  it("outcome=clean when owner-stated FMV is within 5% of AVM", () => {
    const raw = makeCleanRaw(500_000);
    // owner stated 490_000 → delta = 10_000 / 500_000 = 2% → minor? No: 2% < 5% → none
    const ctx = makeContext({ ownerStatedFmv: 490_000 });
    const result = normalizeAttomScreening(raw, ctx);

    expect(result.valueDiscrepancyResult.severity).toBe("none");
    expect(result.outcome).toBe("clean");
  });

  it("outcome=discrepancy when FMV discrepancy is significant (15–30%)", () => {
    const raw = makeCleanRaw(500_000);
    // owner stated 400_000 → delta = 100_000 / 500_000 = 20% → significant
    const ctx = makeContext({ ownerStatedFmv: 400_000 });
    const result = normalizeAttomScreening(raw, ctx);

    expect(result.valueDiscrepancyResult.severity).toBe("significant");
    expect(result.valueDiscrepancyResult.discrepancyFound).toBe(true);
    expect(result.outcome).toBe("discrepancy");
    expect(result.nextVerificationState).toBe("owner_clarification_required");
    // T001 policy: ATTOM always becomes controlling when avmValue > 0, regardless of FMV discrepancy.
    // Admin sees the discrepancy via the value_discrepancy limitingFactor but the value is still adopted.
    expect(result.becameControlling).toBe(true);
  });

  it("outcome=disputed when FMV discrepancy is blocking (>30%)", () => {
    const raw = makeCleanRaw(500_000);
    // owner stated 300_000 → delta = 200_000 / 500_000 = 40% → blocking
    const ctx = makeContext({ ownerStatedFmv: 300_000 });
    const result = normalizeAttomScreening(raw, ctx);

    expect(result.valueDiscrepancyResult.severity).toBe("blocking");
    expect(result.outcome).toBe("disputed");
    expect(result.nextVerificationState).toBe("manual_review_required");
    // T001 policy: ATTOM always becomes controlling when avmValue > 0, regardless of FMV discrepancy.
    expect(result.becameControlling).toBe(true);
  });

  it("valueDiscrepancyResult has correct delta and deltaPercent signs", () => {
    const raw = makeCleanRaw(500_000);
    // AVM > ownerStated → screeningFmv > ownerStatedFmv → delta positive → owner under-stated
    const ctx = makeContext({ ownerStatedFmv: 400_000 });
    const result = normalizeAttomScreening(raw, ctx);

    expect(result.valueDiscrepancyResult.delta).toBeGreaterThan(0);
    expect(result.valueDiscrepancyResult.deltaPercent).toBeGreaterThan(0);
  });

  it("skips value comparison when ownerStatedFmv is null", () => {
    const raw = makeCleanRaw(500_000);
    const ctx = makeContext({ ownerStatedFmv: null });
    const result = normalizeAttomScreening(raw, ctx);

    expect(result.valueDiscrepancyResult.severity).toBeNull();
    expect(result.valueDiscrepancyResult.discrepancyFound).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 4. Debt discrepancy via home-equity signal
// ────────────────────────────────────────────────────────────────────────────

describe("normalizeAttomScreening — debt discrepancy", () => {
  it("computes screeningDebt = avmValue − estEquity", () => {
    const raw = makeCleanRaw(500_000);
    // estEquity = 300_000 → implied debt = 200_000
    raw.avmDetail!.homeEquity = { estEquity: 300_000, estEquityPct: 60 };
    const ctx = makeContext({ ownerDeclaredDebt: 200_000 });
    const result = normalizeAttomScreening(raw, ctx);

    expect(result.debtDiscrepancyResult.screeningDebt).toBe(200_000);
    expect(result.debtDiscrepancyResult.severity).toBe("none");
  });

  it("flags significant debt discrepancy when delta exceeds $25k", () => {
    const raw = makeCleanRaw(500_000);
    // implied debt = 200_000; declared = 240_000 → delta = -40_000 → significant
    raw.avmDetail!.homeEquity = { estEquity: 300_000 };
    const ctx = makeContext({ ownerDeclaredDebt: 240_000 });
    const result = normalizeAttomScreening(raw, ctx);

    expect(result.debtDiscrepancyResult.discrepancyFound).toBe(true);
    expect(result.debtDiscrepancyResult.severity).toBe("significant");
    // T001 policy: debt discrepancy is a review signal only — it does NOT drive the outcome.
    // AVM is otherwise clean, so the outcome remains "clean"; admin reviews the debt mismatch
    // via the debt_discrepancy limitingFactor (severity: "review_required").
    expect(result.outcome).toBe("clean");
  });

  it("skips debt comparison when ownerDeclaredDebt is null", () => {
    const raw = makeCleanRaw(500_000);
    const ctx = makeContext({ ownerDeclaredDebt: null });
    const result = normalizeAttomScreening(raw, ctx);

    expect(result.debtDiscrepancyResult.severity).toBeNull();
    expect(result.debtDiscrepancyResult.discrepancyFound).toBe(false);
  });

  it("skips debt comparison when homeEquity is absent", () => {
    const raw = makeCleanRaw(500_000);
    raw.avmDetail!.homeEquity = undefined;
    const ctx = makeContext({ ownerDeclaredDebt: 200_000 });
    const result = normalizeAttomScreening(raw, ctx);

    expect(result.debtDiscrepancyResult.screeningDebt).toBeNull();
    expect(result.debtDiscrepancyResult.severity).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 5. Weak outcome — no AVM value
// ────────────────────────────────────────────────────────────────────────────

describe("normalizeAttomScreening — weak outcome", () => {
  it("outcome=weak when avmDetail is null", () => {
    const raw = makeCleanRaw();
    raw.avmDetail = null;
    const result = normalizeAttomScreening(raw, makeContext());

    expect(result.outcome).toBe("weak");
    expect(result.nextVerificationState).toBe("manual_review_required");
    expect(result.becameControlling).toBe(false);
    expect(result.controllingFmvCandidate).toBeNull();
    expect(result.rawEstimatedAvailableCash).toBeNull();
    expect(result.fractpathEligibleCashCap).toBeNull();
  });

  it("outcome=weak when AVM amount.value is null", () => {
    const raw = makeCleanRaw();
    raw.avmDetail!.avm = { amount: { value: null, low: null, high: null } };
    const result = normalizeAttomScreening(raw, makeContext());

    expect(result.outcome).toBe("weak");
  });

  it("adds avm_confidence_low limiting factor when outcome is weak", () => {
    const raw = makeCleanRaw();
    raw.avmDetail = null;
    const result = normalizeAttomScreening(raw, makeContext());

    // T001 policy: weak AVM is a review flag (review_required), not a hard blocker.
    // Code renamed from "avm_insufficient" to "avm_confidence_low".
    expect(result.limitingFactors.some((f) => f.code === "avm_confidence_low")).toBe(true);
    expect(result.limitingFactors.find((f) => f.code === "avm_confidence_low")?.severity).toBe("review_required");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 6. Weak outcome — low AVM confidence (wide spread)
// ────────────────────────────────────────────────────────────────────────────

describe("normalizeAttomScreening — low AVM confidence → weak", () => {
  it("outcome=weak when spread ratio exceeds 15%", () => {
    const raw = makeCleanRaw(500_000);
    // spread = 200_000 / 500_000 = 40% → low confidence
    raw.avmDetail!.avm = { amount: { value: 500_000, low: 400_000, high: 600_000 } };
    const result = normalizeAttomScreening(raw, makeContext());

    expect(result.outcome).toBe("weak");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 7. Disputed outcome — property not found in ATTOM
// ────────────────────────────────────────────────────────────────────────────

describe("normalizeAttomScreening — no property record → disputed", () => {
  it("outcome=disputed when propertyDetail is null (not found in ATTOM)", () => {
    const raw = makeCleanRaw(500_000);
    raw.propertyDetail = null;
    const ctx = makeContext({ ownerStatedFmv: 490_000 }); // within tolerance
    const result = normalizeAttomScreening(raw, ctx);

    expect(result.ownerMatchResult.matched).toBe(false);
    expect(result.ownerMatchResult.confidence).toBeNull();
    expect(result.outcome).toBe("disputed");
    expect(result.nextVerificationState).toBe("manual_review_required");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 8. Disputed outcome — blocking value discrepancy
// ────────────────────────────────────────────────────────────────────────────

describe("normalizeAttomScreening — blocking discrepancy → disputed", () => {
  it("outcome=disputed and limitingFactors includes value_discrepancy_blocking", () => {
    const raw = makeCleanRaw(500_000);
    const ctx = makeContext({ ownerStatedFmv: 290_000 }); // 42% off → blocking
    const result = normalizeAttomScreening(raw, ctx);

    expect(result.outcome).toBe("disputed");
    expect(
      result.limitingFactors.some((f) => f.code === "value_discrepancy_blocking"),
    ).toBe(true);
    expect(
      result.limitingFactors.find((f) => f.code === "value_discrepancy_blocking")?.severity,
    ).toBe("blocking");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 9. Cash cap and policy math
// ────────────────────────────────────────────────────────────────────────────

describe("normalizeAttomScreening — cash cap and policy math", () => {
  it("raw cash is floored at 0 when debt exceeds LTV limit", () => {
    const raw = makeCleanRaw(500_000);
    // 500_000 * 0.60 = 300_000; debt = 350_000 → raw = max(0, -50_000) = 0
    const ctx = makeContext({ ownerDeclaredDebt: 350_000, ownerStatedFmv: 495_000 });
    const result = normalizeAttomScreening(raw, ctx);

    expect(result.rawEstimatedAvailableCash).toBe(0);
    expect(result.fractpathEligibleCashCap).toBe(0);
  });

  it("fractpathEligibleCashCap equals rawEstimatedAvailableCash when below cap", () => {
    const raw = makeCleanRaw(400_000);
    // 400_000 * 0.60 - 100_000 = 140_000 < 250_000 → cap = 140_000
    const ctx = makeContext({ ownerDeclaredDebt: 100_000, ownerStatedFmv: 395_000 });
    const result = normalizeAttomScreening(raw, ctx);

    expect(result.rawEstimatedAvailableCash).toBe(140_000);
    expect(result.fractpathEligibleCashCap).toBe(140_000);
  });

  it("handles null ownerDeclaredDebt by treating debt as 0", () => {
    const raw = makeCleanRaw(500_000);
    const ctx = makeContext({ ownerDeclaredDebt: null, ownerStatedFmv: 495_000 });
    const result = normalizeAttomScreening(raw, ctx);

    // null debt treated as 0: 500_000 * 0.60 - 0 = 300_000 → capped at 250_000
    expect(result.rawEstimatedAvailableCash).toBe(300_000);
    expect(result.fractpathEligibleCashCap).toBe(250_000);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 10. becameControlling on non-clean outcomes
// ────────────────────────────────────────────────────────────────────────────

describe("normalizeAttomScreening — becameControlling on non-clean outcomes", () => {
  it("discrepancy outcome → becameControlling=true per T001 policy (FMV still adopted)", () => {
    const raw = makeCleanRaw(500_000);
    const ctx = makeContext({ ownerStatedFmv: 400_000 }); // 20% off → discrepancy
    const result = normalizeAttomScreening(raw, ctx);

    expect(result.outcome).toBe("discrepancy");
    // T001 policy: ATTOM becomes controlling whenever avmValue > 0.
    // FMV discrepancy is an admin review flag, not a controlling gate.
    expect(result.becameControlling).toBe(true);
    expect(result.controllingFmvCandidate).toBe(500_000);
  });

  it("weak outcome → becameControlling=false (no avmValue available)", () => {
    const raw = makeCleanRaw();
    raw.avmDetail = null;
    const result = normalizeAttomScreening(raw, makeContext());

    // No AVM value → becameControlling remains false (nothing to adopt)
    expect(result.becameControlling).toBe(false);
    expect(result.controllingFmvCandidate).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 11. limitingFactors — compound discrepancies
// ────────────────────────────────────────────────────────────────────────────

describe("normalizeAttomScreening — limitingFactors", () => {
  it("includes both debt and value factors when both are significant", () => {
    const raw = makeCleanRaw(500_000);
    // value discrepancy: 20% → significant
    // debt discrepancy: implied = 200_000; declared = 240_000 → 40k → significant
    raw.avmDetail!.homeEquity = { estEquity: 300_000 };
    const ctx = makeContext({ ownerStatedFmv: 400_000, ownerDeclaredDebt: 240_000 });
    const result = normalizeAttomScreening(raw, ctx);

    const codes = result.limitingFactors.map((f) => f.code);
    expect(codes).toContain("value_discrepancy_significant");
    expect(codes).toContain("debt_discrepancy_significant");
  });

  it("adds data_conflict_requires_manual_review factor on disputed outcome", () => {
    const raw = makeCleanRaw(500_000);
    raw.propertyDetail = null;
    const result = normalizeAttomScreening(raw, makeContext({ ownerStatedFmv: 495_000 }));

    expect(result.outcome).toBe("disputed");
    expect(
      result.limitingFactors.some((f) => f.code === "data_conflict_requires_manual_review"),
    ).toBe(true);
  });
});
