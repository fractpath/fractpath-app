import { describe, it, expect } from "vitest";
import { roundMoney, roundIRRMonthly, roundIRRAnnual } from "../src/rounding.js";

describe("rounding utilities", () => {
  describe("roundMoney", () => {
    it("rounds to 2 decimal places", () => {
      expect(roundMoney(1.005)).toBe(1.01);
      expect(roundMoney(1.004)).toBe(1.0);
      expect(roundMoney(100.999)).toBe(101.0);
    });

    it("handles negative values", () => {
      expect(roundMoney(-1.005)).toBe(-1.0);
      expect(roundMoney(-1.006)).toBe(-1.01);
    });

    it("handles zero", () => {
      expect(roundMoney(0)).toBe(0);
    });

    it("handles large values", () => {
      expect(roundMoney(999999.995)).toBe(1000000.0);
    });
  });

  describe("roundIRRMonthly", () => {
    it("rounds to 6 decimal places", () => {
      expect(roundIRRMonthly(0.0123456789)).toBe(0.012346);
    });
  });

  describe("roundIRRAnnual", () => {
    it("rounds to 4 decimal places", () => {
      expect(roundIRRAnnual(0.123456)).toBe(0.1235);
    });
  });
});
