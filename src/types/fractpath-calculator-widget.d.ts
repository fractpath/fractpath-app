declare module "fractpath-calculator-widget" {
  import type { ComponentType } from "react";

  // Minimal shims for app build. Prefer replacing with real types when the package publishes .d.ts.
  export const FractPathCalculatorWidget: ComponentType<any>;
  export const DealSnapshotView: ComponentType<any>;
  export const DealEditModal: ComponentType<any>;

  // Commonly used exports (optional shims)
  export const CONTRACT_VERSION: string;
  export const SCHEMA_VERSION: string;
  export type CalculatorPersona = "homeowner" | "buyer" | "realtor" | "investor" | "ops";
}
