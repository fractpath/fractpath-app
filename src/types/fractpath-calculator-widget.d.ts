declare module "fractpath-calculator-widget" {
  // Version constants
  export const CONTRACT_VERSION: string;
  export const SCHEMA_VERSION: string;
  export const ENGINE_VERSION: string;

  // Canonical compute surface (typed loosely to avoid drift)
  export function computeScenario(input: any): any;

  // Common UI exports used by app/marketing embeds
  export const FractPathCalculatorWidget: any;

  // Some builds import other helpers/components; keep these permissive.
  export const DealEditModal: any;
  export const EditModalMount: any;
  export const DealKpiStrip: any;
  export const DealSnapshotView: any;
  export const EquityChart: any;
  export const EquityTransferChart: any;

  export const FEE_DEFAULTS: any;
  export const MARKETING_PERSONAS: any;

  export function buildChartSeries(...args: any[]): any;
  export function buildDraftSnapshot(...args: any[]): any;
  export function buildFullDealSnapshotV1(...args: any[]): any;
  export function buildSavePayload(...args: any[]): any;
  export function buildShareSummary(...args: any[]): any;

  export function deterministicHash(...args: any[]): any;
  export function getLabel(...args: any[]): any;
  export function getPersonaConfig(...args: any[]): any;
  export function getSummaryOrder(...args: any[]): any;
  export function normalizeInputs(...args: any[]): any;
  export function resolvePersonaPresentation(...args: any[]): any;

  export function useKioskInput(...args: any[]): any;
}
