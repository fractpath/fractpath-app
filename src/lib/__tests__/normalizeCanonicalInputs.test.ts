import { describe, it, expect } from "vitest";
import {
  normalizeCanonicalInputsFromUnknown,
  readCanonicalInputsFromDraftTokenSnapshot,
} from "../normalizeCanonicalInputs";

describe("normalizeCanonicalInputsFromUnknown", () => {
  it("prefers canonicalSnapshot.inputs when present", () => {
    const payload = {
      canonicalSnapshot: {
        inputs: {
          deal_terms: { property_value: 600000 },
          scenario: { foo: "bar" },
        },
      },
      canonicalInputs: {
        deal_terms: { property_value: 123 },
        scenario: { foo: "nope" },
      },
      draftSnapshot: {
        deal_terms: { property_value: 456 },
        scenario: { foo: "nope2" },
      },
    };

    const out = normalizeCanonicalInputsFromUnknown(payload);
    expect(out).not.toBeNull();
    expect(out!.deal_terms.property_value).toBe(600000);
    expect(out!.scenario.foo).toBe("bar");
  });

  it("accepts { inputs: { deal_terms, scenario } }", () => {
    const payload = {
      inputs: { deal_terms: { property_value: 600000 }, scenario: { a: 1 } },
    };
    const out = normalizeCanonicalInputsFromUnknown(payload);
    expect(out).not.toBeNull();
    expect(out!.deal_terms.property_value).toBe(600000);
  });

  it("accepts { deal_terms, scenario }", () => {
    const payload = {
      deal_terms: { property_value: 600000 },
      scenario: { a: 1 },
    };
    const out = normalizeCanonicalInputsFromUnknown(payload);
    expect(out).not.toBeNull();
    expect(out!.deal_terms.property_value).toBe(600000);
  });

  it("maps assumptions -> scenario for compat shape", () => {
    const payload = {
      deal_terms: { property_value: 600000 },
      assumptions: { a: 1 },
    };
    const out = normalizeCanonicalInputsFromUnknown(payload);
    expect(out).not.toBeNull();
    expect(out!.scenario.a).toBe(1);
  });
});

describe("readCanonicalInputsFromDraftTokenSnapshot", () => {
  it("extracts deal_terms.property_value from token snapshot_json", () => {
    const snapshot_json = {
      canonicalSnapshot: {
        inputs: {
          deal_terms: { property_value: 600000 },
          scenario: { a: 1 },
        },
      },
      canonicalInputs: {
        deal_terms: { property_value: 123 },
        scenario: { a: 2 },
      },
      draftSnapshot: {
        deal_terms: { property_value: 456 },
        assumptions: { a: 3 },
      },
    };

    const out = readCanonicalInputsFromDraftTokenSnapshot(snapshot_json);
    expect(out).not.toBeNull();
    expect(out!.deal_terms.property_value).toBe(600000);
  });
});
