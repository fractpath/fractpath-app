import type { CalculatorPersona } from "./types.js";
import type { ScenarioOutputs } from "../calc/types.js";

export type PersonaConfig = {
  heroLabel: string;
  heroValue: (outputs: ScenarioOutputs) => number;
  helperText: string;
};

const configs: Record<CalculatorPersona, PersonaConfig> = {
  homeowner: {
    heroLabel: "Your Net Payout",
    heroValue: (o) => o.settlements.standard.netPayout,
    helperText: "Estimated net payout at standard settlement timing.",
  },
  buyer: {
    heroLabel: "Projected Net Return",
    heroValue: (o) => o.settlements.standard.netPayout,
    helperText: "Projected net return at standard settlement timing.",
  },
  investor: {
    heroLabel: "Projected Net Return",
    heroValue: (o) => o.settlements.standard.netPayout,
    helperText: "Projected net return at standard settlement timing.",
  },
  realtor: {
    heroLabel: "Standard Net Payout",
    heroValue: (o) => o.settlements.standard.netPayout,
    helperText: "Standard net payout for commission reference.",
  },
  ops: {
    heroLabel: "Standard Net Payout",
    heroValue: (o) => o.settlements.standard.netPayout,
    helperText: "Standard net payout at projected settlement.",
  },
};

export function getPersonaConfig(persona: CalculatorPersona): PersonaConfig {
  return configs[persona] ?? configs.homeowner;
}
