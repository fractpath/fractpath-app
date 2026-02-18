import { describe, it, expect } from "vitest";
import { computeScenario } from "../calc/calc.js";
import { buildDraftSnapshot, buildShareSummary, buildSavePayload } from "../widget/snapshot.js";

const DRAFT_SNAPSHOT_ALLOWED_KEYS = [
  "contract_version",
  "schema_version",
  "persona",
  "mode",
  "inputs",
  "basic_results",
  "input_hash",
  "output_hash",
  "created_at",
] as const;

const DRAFT_INPUTS_ALLOWED_KEYS = [
  "homeValue",
  "initialBuyAmount",
  "termYears",
  "annualGrowthRate",
] as const;

const DRAFT_BASIC_RESULTS_ALLOWED_KEYS = [
  "standard_net_payout",
  "early_net_payout",
  "late_net_payout",
  "standard_settlement_month",
  "early_settlement_month",
  "late_settlement_month",
] as const;

const SHARE_SUMMARY_ALLOWED_KEYS = [
  "contract_version",
  "schema_version",
  "persona",
  "inputs",
  "basic_results",
  "created_at",
] as const;

const SHARE_BASIC_RESULTS_ALLOWED_KEYS = [
  "standard_net_payout",
  "early_net_payout",
  "late_net_payout",
] as const;

const SAVE_PAYLOAD_ALLOWED_KEYS = [
  "contract_version",
  "schema_version",
  "persona",
  "mode",
  "inputs",
  "outputs",
  "input_hash",
  "output_hash",
  "created_at",
] as const;

describe("Schema allowlist: DraftSnapshot", () => {
  it("has exactly the allowed top-level keys", async () => {
    const out = computeScenario({});
    const snap = await buildDraftSnapshot("buyer", out.normalizedInputs, out);
    const keys = Object.keys(snap).sort();
    expect(keys).toEqual([...DRAFT_SNAPSHOT_ALLOWED_KEYS].sort());
  });

  it("inputs has exactly the allowed keys", async () => {
    const out = computeScenario({});
    const snap = await buildDraftSnapshot("buyer", out.normalizedInputs, out);
    const keys = Object.keys(snap.inputs).sort();
    expect(keys).toEqual([...DRAFT_INPUTS_ALLOWED_KEYS].sort());
  });

  it("basic_results has exactly the allowed keys", async () => {
    const out = computeScenario({});
    const snap = await buildDraftSnapshot("buyer", out.normalizedInputs, out);
    const keys = Object.keys(snap.basic_results).sort();
    expect(keys).toEqual([...DRAFT_BASIC_RESULTS_ALLOWED_KEYS].sort());
  });

  it("mode is always 'marketing'", async () => {
    const out = computeScenario({});
    const snap = await buildDraftSnapshot("investor", out.normalizedInputs, out);
    expect(snap.mode).toBe("marketing");
  });

  it("no app-mode fields leak (rawPayout, clampedPayout, etc.)", async () => {
    const out = computeScenario({});
    const snap = await buildDraftSnapshot("buyer", out.normalizedInputs, out);
    const json = JSON.stringify(snap);
    expect(json).not.toContain("rawPayout");
    expect(json).not.toContain("clampedPayout");
    expect(json).not.toContain("transferFeeAmount");
    expect(json).not.toContain("equityPctAtSettlement");
    expect(json).not.toContain("homeValueAtSettlement");
    expect(json).not.toContain("series");
  });
});

describe("Schema allowlist: ShareSummary", () => {
  it("has exactly the allowed top-level keys", () => {
    const out = computeScenario({});
    const summary = buildShareSummary("buyer", out.normalizedInputs, out);
    const keys = Object.keys(summary).sort();
    expect(keys).toEqual([...SHARE_SUMMARY_ALLOWED_KEYS].sort());
  });

  it("basic_results has exactly the allowed keys", () => {
    const out = computeScenario({});
    const summary = buildShareSummary("buyer", out.normalizedInputs, out);
    const keys = Object.keys(summary.basic_results).sort();
    expect(keys).toEqual([...SHARE_BASIC_RESULTS_ALLOWED_KEYS].sort());
  });

  it("does not contain input_hash, output_hash, or mode", () => {
    const out = computeScenario({});
    const summary = buildShareSummary("buyer", out.normalizedInputs, out);
    const json = JSON.stringify(summary);
    expect(json).not.toContain("input_hash");
    expect(json).not.toContain("output_hash");
    expect(json).not.toContain('"mode"');
  });

  it("does not contain settlement months", () => {
    const out = computeScenario({});
    const summary = buildShareSummary("buyer", out.normalizedInputs, out);
    const json = JSON.stringify(summary);
    expect(json).not.toContain("settlement_month");
  });
});

describe("Schema allowlist: SavePayload", () => {
  it("has exactly the allowed top-level keys", async () => {
    const out = computeScenario({});
    const payload = await buildSavePayload("buyer", out.normalizedInputs, out);
    const keys = Object.keys(payload).sort();
    expect(keys).toEqual([...SAVE_PAYLOAD_ALLOWED_KEYS].sort());
  });

  it("mode is always 'app'", async () => {
    const out = computeScenario({});
    const payload = await buildSavePayload("ops", out.normalizedInputs, out);
    expect(payload.mode).toBe("app");
  });

  it("contains full ScenarioInputs and ScenarioOutputs", async () => {
    const out = computeScenario({});
    const payload = await buildSavePayload("buyer", out.normalizedInputs, out);
    expect(payload.inputs).toHaveProperty("vesting");
    expect(payload.inputs).toHaveProperty("cpw");
    expect(payload.outputs).toHaveProperty("settlements");
    expect(payload.outputs).toHaveProperty("series");
    expect(payload.outputs.settlements).toHaveProperty("standard");
    expect(payload.outputs.settlements).toHaveProperty("early");
    expect(payload.outputs.settlements).toHaveProperty("late");
  });
});
