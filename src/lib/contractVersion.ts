// src/lib/contractVersion.ts
// Single source of truth for version constants in the app:
// import them from the widget package (same artifact used in UI).

export {
  CONTRACT_VERSION,
  SCHEMA_VERSION,
  // NOTE: widget may or may not export COMPUTE_VERSION / ENGINE_VERSION depending on how it was packaged.
  // If your build fails on these, remove them here and in call sites, and use CONTRACT_VERSION only.
  COMPUTE_VERSION,
  ENGINE_VERSION,
} from "fractpath-calculator-widget";
