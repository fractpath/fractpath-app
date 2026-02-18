import { describe, it, expect } from "vitest";
import { computeScenario } from "../calc/calc.js";
import { buildDraftSnapshot, buildShareSummary } from "../widget/snapshot.js";

describe("Mode gating: marketing mode cannot expose excluded fields", () => {
  const EXCLUDED_MARKETING_FIELDS = [
    "rawPayout",
    "clampedPayout",
    "transferFeeAmount",
    "transferFeeRate",
    "equityPctAtSettlement",
    "homeValueAtSettlement",
    "floor",
    "cap",
    "applied",
    "series",
    "normalizedInputs",
  ];

  it("DraftSnapshot does not contain any excluded fields", async () => {
    const out = computeScenario({
      homeValue: 800_000,
      initialBuyAmount: 150_000,
      termYears: 15,
      annualGrowthRate: 0.04,
    });
    const snap = await buildDraftSnapshot("homeowner", out.normalizedInputs, out);
    const json = JSON.stringify(snap);

    for (const field of EXCLUDED_MARKETING_FIELDS) {
      expect(json).not.toContain(`"${field}"`);
    }
  });

  it("ShareSummary does not contain any excluded fields", () => {
    const out = computeScenario({
      homeValue: 800_000,
      initialBuyAmount: 150_000,
      termYears: 15,
      annualGrowthRate: 0.04,
    });
    const summary = buildShareSummary("homeowner", out.normalizedInputs, out);
    const json = JSON.stringify(summary);

    for (const field of EXCLUDED_MARKETING_FIELDS) {
      expect(json).not.toContain(`"${field}"`);
    }
  });

  it("DraftSnapshot only contains basic_results numeric values", async () => {
    const out = computeScenario({});
    const snap = await buildDraftSnapshot("buyer", out.normalizedInputs, out);

    expect(typeof snap.basic_results.standard_net_payout).toBe("number");
    expect(typeof snap.basic_results.early_net_payout).toBe("number");
    expect(typeof snap.basic_results.late_net_payout).toBe("number");
    expect(typeof snap.basic_results.standard_settlement_month).toBe("number");
    expect(typeof snap.basic_results.early_settlement_month).toBe("number");
    expect(typeof snap.basic_results.late_settlement_month).toBe("number");
  });

  it("ShareSummary only contains net payout values (no settlement months)", () => {
    const out = computeScenario({});
    const summary = buildShareSummary("buyer", out.normalizedInputs, out);

    expect(typeof summary.basic_results.standard_net_payout).toBe("number");
    expect(typeof summary.basic_results.early_net_payout).toBe("number");
    expect(typeof summary.basic_results.late_net_payout).toBe("number");
    expect(Object.keys(summary.basic_results)).toHaveLength(3);
  });

  it("all personas produce valid DraftSnapshots with same schema", async () => {
    const personas = ["buyer", "homeowner", "investor", "realtor", "ops"] as const;
    const out = computeScenario({});

    for (const p of personas) {
      const snap = await buildDraftSnapshot(p, out.normalizedInputs, out);
      expect(snap.persona).toBe(p);
      expect(snap.mode).toBe("marketing");
      expect(Object.keys(snap)).toHaveLength(9);
      expect(Object.keys(snap.inputs)).toHaveLength(4);
      expect(Object.keys(snap.basic_results)).toHaveLength(6);
    }
  });

  it("all personas produce valid ShareSummaries with same schema", () => {
    const personas = ["buyer", "homeowner", "investor", "realtor", "ops"] as const;
    const out = computeScenario({});

    for (const p of personas) {
      const summary = buildShareSummary(p, out.normalizedInputs, out);
      expect(summary.persona).toBe(p);
      expect(Object.keys(summary)).toHaveLength(6);
      expect(Object.keys(summary.basic_results)).toHaveLength(3);
    }
  });
});
