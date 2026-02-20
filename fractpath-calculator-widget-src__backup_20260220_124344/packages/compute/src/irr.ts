import { roundIRRMonthly, roundIRRAnnual } from "./rounding.js";

const MAX_ITERATIONS = 1000;
const EPSILON = 1e-10;

function npv(rate: number, cashflows: number[]): number {
  let total = 0;
  for (let i = 0; i < cashflows.length; i++) {
    total += cashflows[i] / Math.pow(1 + rate, i);
  }
  return total;
}

function npvDerivative(rate: number, cashflows: number[]): number {
  let total = 0;
  for (let i = 1; i < cashflows.length; i++) {
    total += -i * cashflows[i] / Math.pow(1 + rate, i + 1);
  }
  return total;
}

export function solveMonthlyIRR(cashflows: number[]): number | null {
  if (cashflows.length < 2) return null;

  let rate = 0.01;

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const f = npv(rate, cashflows);
    const fPrime = npvDerivative(rate, cashflows);

    if (Math.abs(fPrime) < 1e-20) {
      return fallbackBisection(cashflows);
    }

    const newRate = rate - f / fPrime;

    if (newRate <= -1) {
      return fallbackBisection(cashflows);
    }

    if (Math.abs(newRate - rate) < EPSILON) {
      return roundIRRMonthly(newRate);
    }

    rate = newRate;
  }

  return fallbackBisection(cashflows);
}

function fallbackBisection(cashflows: number[]): number | null {
  let low = -0.999;
  let high = 10.0;

  const fLow = npv(low, cashflows);
  const fHigh = npv(high, cashflows);

  if (fLow * fHigh > 0) return null;

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const mid = (low + high) / 2;
    const fMid = npv(mid, cashflows);

    if (Math.abs(fMid) < EPSILON || (high - low) / 2 < EPSILON) {
      return roundIRRMonthly(mid);
    }

    if (fMid * npv(low, cashflows) < 0) {
      high = mid;
    } else {
      low = mid;
    }
  }

  return null;
}

export function annualizeIRR(monthlyIRR: number): number {
  const annual = Math.pow(1 + monthlyIRR, 12) - 1;
  return roundIRRAnnual(annual);
}

export function computeIRR(cashflows: number[]): number {
  const monthly = solveMonthlyIRR(cashflows);
  if (monthly === null) {
    return 0;
  }
  return annualizeIRR(monthly);
}
