export interface DealCalculatorGatingInput {
  role: string;
  isLatest: boolean;
}

export function shouldRenderDealCalculator(input: DealCalculatorGatingInput): boolean {
  if (input.role !== "OWNER") return false;
  if (!input.isLatest) return false;
  return true;
}
