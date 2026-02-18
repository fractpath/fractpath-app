export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function roundIRRMonthly(value: number): number {
  return Math.round((value + Number.EPSILON) * 1e6) / 1e6;
}

export function roundIRRAnnual(value: number): number {
  return Math.round((value + Number.EPSILON) * 1e4) / 1e4;
}
