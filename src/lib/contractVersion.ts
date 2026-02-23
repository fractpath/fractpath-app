// src/lib/contractVersion.ts
// Single source of truth for version constants in the app.
// App repo must only consume the widget artifact, but the packaged .d.ts may not expose all named exports.
// Use a namespace import + runtime-safe reads to keep Next build green.

import * as Widget from "fractpath-calculator-widget";

const W: any = Widget as any;

// Required: these must exist for canonical snapshots.
export const CONTRACT_VERSION: string =
  typeof W.CONTRACT_VERSION === "string" ? W.CONTRACT_VERSION : "";
export const SCHEMA_VERSION: string =
  typeof W.SCHEMA_VERSION === "string" ? W.SCHEMA_VERSION : "";

// Optional: some widget builds may not export these; fall back to CONTRACT_VERSION.
export const COMPUTE_VERSION: string =
  typeof W.COMPUTE_VERSION === "string" ? W.COMPUTE_VERSION : CONTRACT_VERSION;
export const ENGINE_VERSION: string =
  typeof W.ENGINE_VERSION === "string" ? W.ENGINE_VERSION : CONTRACT_VERSION;

if (!CONTRACT_VERSION || !SCHEMA_VERSION) {
  // Fail fast at runtime if the widget artifact isn't exporting required contract fields.
  throw new Error(
    "fractpath-calculator-widget is missing required version exports (CONTRACT_VERSION/SCHEMA_VERSION)",
  );
}
