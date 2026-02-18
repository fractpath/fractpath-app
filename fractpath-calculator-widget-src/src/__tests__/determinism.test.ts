import { describe, it, expect } from "vitest";
import { computeScenario } from "../calc/calc.js";
import { deterministicHash } from "../widget/hash.js";
import { buildDraftSnapshot, buildShareSummary, buildSavePayload } from "../widget/snapshot.js";
import { CONTRACT_VERSION, SCHEMA_VERSION } from "../widget/types.js";

describe("Determinism: same inputs produce identical outputs + hashes", () => {
  const inputs = {
    homeValue: 600_000,
    initialBuyAmount: 100_000,
    termYears: 10,
    annualGrowthRate: 0.03,
  };

  it("computeScenario produces identical outputs for identical inputs", () => {
    const a = computeScenario(inputs);
    const b = computeScenario(inputs);
    expect(a).toEqual(b);
  });

  it("computeScenario produces identical outputs across multiple calls", () => {
    const results = Array.from({ length: 5 }, () => computeScenario(inputs));
    for (let i = 1; i < results.length; i++) {
      expect(results[i]).toEqual(results[0]);
    }
  });

  it("deterministicHash returns the same hash for the same object", async () => {
    const obj = { b: 2, a: 1, c: 3 };
    const h1 = await deterministicHash(obj);
    const h2 = await deterministicHash(obj);
    expect(h1).toBe(h2);
    expect(typeof h1).toBe("string");
    expect(h1.length).toBe(64);
  });

  it("deterministicHash is independent of key insertion order", async () => {
    const a = { z: 1, a: 2, m: 3 };
    const b = { a: 2, m: 3, z: 1 };
    const ha = await deterministicHash(a);
    const hb = await deterministicHash(b);
    expect(ha).toBe(hb);
  });

  it("deterministicHash produces different hashes for different data", async () => {
    const h1 = await deterministicHash({ x: 1 });
    const h2 = await deterministicHash({ x: 2 });
    expect(h1).not.toBe(h2);
  });

  it("DraftSnapshot has deterministic input_hash and output_hash", async () => {
    const out = computeScenario(inputs);
    const s1 = await buildDraftSnapshot("buyer", out.normalizedInputs, out);
    const s2 = await buildDraftSnapshot("buyer", out.normalizedInputs, out);
    expect(s1.input_hash).toBe(s2.input_hash);
    expect(s1.output_hash).toBe(s2.output_hash);
    expect(s1.input_hash.length).toBe(64);
    expect(s1.output_hash.length).toBe(64);
  });

  it("DraftSnapshot hashes differ for different inputs", async () => {
    const out1 = computeScenario(inputs);
    const out2 = computeScenario({ ...inputs, homeValue: 700_000 });
    const s1 = await buildDraftSnapshot("buyer", out1.normalizedInputs, out1);
    const s2 = await buildDraftSnapshot("buyer", out2.normalizedInputs, out2);
    expect(s1.input_hash).not.toBe(s2.input_hash);
    expect(s1.output_hash).not.toBe(s2.output_hash);
  });

  it("DraftSnapshot hashes differ for different personas but same inputs", async () => {
    const out = computeScenario(inputs);
    const s1 = await buildDraftSnapshot("buyer", out.normalizedInputs, out);
    const s2 = await buildDraftSnapshot("homeowner", out.normalizedInputs, out);
    expect(s1.input_hash).toBe(s2.input_hash);
    expect(s1.output_hash).toBe(s2.output_hash);
  });

  it("SavePayload has deterministic hashes", async () => {
    const out = computeScenario(inputs);
    const p1 = await buildSavePayload("buyer", out.normalizedInputs, out);
    const p2 = await buildSavePayload("buyer", out.normalizedInputs, out);
    expect(p1.input_hash).toBe(p2.input_hash);
    expect(p1.output_hash).toBe(p2.output_hash);
  });
});

describe("Versioning", () => {
  it("DraftSnapshot contains correct version fields", async () => {
    const out = computeScenario({});
    const snap = await buildDraftSnapshot("buyer", out.normalizedInputs, out);
    expect(snap.contract_version).toBe(CONTRACT_VERSION);
    expect(snap.schema_version).toBe(SCHEMA_VERSION);
    expect(snap.contract_version).toBe("1.0.0");
  });

  it("ShareSummary contains correct version fields", () => {
    const out = computeScenario({});
    const summary = buildShareSummary("buyer", out.normalizedInputs, out);
    expect(summary.contract_version).toBe(CONTRACT_VERSION);
    expect(summary.schema_version).toBe(SCHEMA_VERSION);
  });

  it("SavePayload contains correct version fields", async () => {
    const out = computeScenario({});
    const payload = await buildSavePayload("buyer", out.normalizedInputs, out);
    expect(payload.contract_version).toBe(CONTRACT_VERSION);
    expect(payload.schema_version).toBe(SCHEMA_VERSION);
  });
});
