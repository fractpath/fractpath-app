import { createRoot, type Root } from "react-dom/client";
import App from "./App";
import { mountFractpathWidget } from "./embed";

type Persona = "Buyer" | "Homeowner" | "Realtor";

let root: Root | null = null;
let currentPersona: Persona = "Buyer";

// Bump this string any time you want to force-proof what version is live.
const WIDGET_VERSION = "v1.0.0-getScenarioSummary";

/**
 * Mounts the calculator into a DOM element.
 * Safe to call multiple times; it will reuse the same React root.
 */
export function mount(el: HTMLElement) {
  try {
    if (!el) return;

    if (!root) {
      root = createRoot(el);
    }

    root.render(<App key={currentPersona} initialPersona={currentPersona} />);
  } catch (err) {
    console.error("[FractPathCalculator] mount failed:", err);
    el.innerHTML =
      "The scenario tool is temporarily unavailable. Please request a manual scenario review.";
  }
}

/**
 * Sets the persona (called from Webflow). Will re-render if mounted.
 */
export function setPersona(persona: Persona) {
  currentPersona = persona;
  const mountEl = document.getElementById("fractpath-calculator");
  if (mountEl) mount(mountEl);
}

/**
 * Returns a human-readable scenario summary for CRM logging.
 * Sprint 1: persona-only summary (scenario inputs not implemented yet).
 */
export function getScenarioSummary() {
  return `persona=${currentPersona} | source=fractpath_web_calculator_v1 | widget_version=${WIDGET_VERSION}`;
}

/**
 * Resets the scenario state (placeholder for later).
 */
export function resetScenario() {
  const mountEl = document.getElementById("fractpath-calculator");
  if (mountEl) mount(mountEl);
}

/**
 * Auto-mount on DOM ready (safe no-op if element not found).
 */
function autoMountWhenReady() {
  const mountEl = document.getElementById("fractpath-calculator");
  if (!mountEl) return;
  mount(mountEl);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", autoMountWhenReady);
} else {
  autoMountWhenReady();
}

// ---- Global API (MERGE, DON'T REPLACE) ----
declare global {
  interface Window {
    FractPathCalculator?: {
      mount?: (el: HTMLElement) => void;
      setPersona?: (persona: Persona) => void;
      resetScenario?: () => void;
      getScenarioSummary?: () => string;
      mountFractpathWidget?: typeof mountFractpathWidget;
      __version?: string;
    };
  }
}

// Merge into any existing object to avoid being overwritten by load order issues.
const existing = window.FractPathCalculator || {};

window.FractPathCalculator = {
  ...existing,
  mount,
  setPersona,
  resetScenario,
  getScenarioSummary,
  mountFractpathWidget,
  __version: WIDGET_VERSION,
};
