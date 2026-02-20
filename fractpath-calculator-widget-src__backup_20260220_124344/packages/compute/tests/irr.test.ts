import { describe, it, expect } from "vitest";
import { solveMonthlyIRR, annualizeIRR, computeIRR } from "../src/irr.js";
import { roundIRRAnnual } from "../src/rounding.js";

describe("IRR solver", () => {
  it("solves a simple 2-cashflow IRR", () => {
    const cf = [-100, 110];
    const monthly = solveMonthlyIRR(cf);
    expect(monthly).not.toBeNull();
    expect(monthly!).toBeCloseTo(0.1, 2);
  });

  it("solves monthly IRR for a multi-period investment", () => {
    const cf = [-1000, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 200];
    const monthly = solveMonthlyIRR(cf);
    expect(monthly).not.toBeNull();
    expect(monthly!).toBeGreaterThan(0);
  });

  it("annualizeIRR converts monthly to annual", () => {
    const monthlyRate = 0.01;
    const annual = annualizeIRR(monthlyRate);
    const expected = roundIRRAnnual(Math.pow(1.01, 12) - 1);
    expect(annual).toBe(expected);
  });

  it("computeIRR handles a typical deal cashflow", () => {
    const cf: number[] = [-60000];
    for (let i = 1; i <= 72; i++) cf.push(-2000);
    for (let i = 73; i <= 83; i++) cf.push(0);
    cf.push(250000);
    const annual = computeIRR(cf);
    expect(Number.isFinite(annual)).toBe(true);
    expect(annual).toBeGreaterThan(0);
  });

  it("returns 0 when IRR cannot be solved", () => {
    const cf = [-100, -100, -100];
    const annual = computeIRR(cf);
    expect(annual).toBe(0);
  });

  it("is deterministic across calls", () => {
    const cf = [-60000];
    for (let i = 1; i <= 72; i++) cf.push(-2000);
    cf.push(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 250000);
    const results = Array.from({ length: 5 }, () => computeIRR([...cf]));
    for (let i = 1; i < results.length; i++) {
      expect(results[i]).toBe(results[0]);
    }
  });
});
