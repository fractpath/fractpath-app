type AnyObj = Record<string, unknown>;

export type DealCardMeta = {
  addressTitle: string | null;
  fmv: number | null;
  upfront: number | null;
  monthly: number | null;
  exitYear: number | null;
  vested: { currentPct: number | null; totalPct: number | null };
};

function isObj(v: unknown): v is AnyObj {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

function dig(obj: unknown, ...keys: string[]): unknown {
  let cur = obj;
  for (const k of keys) {
    if (!isObj(cur)) return undefined;
    cur = (cur as AnyObj)[k];
  }
  return cur;
}

function first(obj: unknown, paths: string[][]): unknown {
  for (const p of paths) {
    const v = dig(obj, ...p);
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
}

function clampPct(v: number | null): number | null {
  if (v === null) return null;
  const pct = v >= 0 && v <= 1 ? v * 100 : v;
  return Math.round(Math.max(0, Math.min(100, pct)));
}

function resolveTerms(snap: AnyObj): AnyObj {
  const fromInputs = dig(snap, "inputs", "deal_terms");
  if (isObj(fromInputs)) return fromInputs;
  const topLevel = dig(snap, "deal_terms");
  if (isObj(topLevel)) return topLevel;
  const inputs = dig(snap, "inputs");
  if (isObj(inputs) && ("property_value" in inputs || "upfront_payment" in inputs)) return inputs;
  return {};
}

function resolveResults(snap: AnyObj): AnyObj {
  const r = dig(snap, "outputs", "results");
  if (isObj(r)) return r;
  const topResults = dig(snap, "results");
  if (isObj(topResults)) return topResults;
  return {};
}

function resolveScenario(snap: AnyObj): AnyObj {
  const s = dig(snap, "inputs", "scenario");
  if (isObj(s)) return s;
  const topScenario = dig(snap, "scenario");
  if (isObj(topScenario)) return topScenario;
  return {};
}

export function extractDealCardMeta(snapshotJson: unknown): DealCardMeta {
  const empty: DealCardMeta = {
    addressTitle: null,
    fmv: null,
    upfront: null,
    monthly: null,
    exitYear: null,
    vested: { currentPct: null, totalPct: null },
  };

  if (!isObj(snapshotJson)) return empty;

  const snap = snapshotJson as AnyObj;
  const terms = resolveTerms(snap);
  const results = resolveResults(snap);
  const scenario = resolveScenario(snap);

  const addressTitle =
    str(dig(snap, "inputs", "deal_terms", "property_address")) ??
    str(dig(snap, "deal_terms", "property_address")) ??
    str(dig(snap, "inputs", "deal_terms", "address")) ??
    str(dig(snap, "deal_terms", "address")) ??
    str(dig(snap, "inputs", "deal_terms", "home_address")) ??
    str(dig(snap, "deal_terms", "home_address")) ??
    str((terms as AnyObj).property_address) ??
    str((terms as AnyObj).address) ??
    str((terms as AnyObj).home_address) ??
    null;

  const fmv =
    num(terms.property_value) ??
    num(first(snap, [
      ["outputs", "results", "fmv"],
      ["outputs", "results", "amv"],
      ["outputs", "results", "property_value"],
      ["results", "fmv"],
      ["results", "amv"],
      ["results", "property_value"],
    ])) ??
    null;

  const upfront = num(terms.upfront_payment) ?? null;
  const monthly = num(terms.monthly_payment) ?? null;

  const exitYear =
    num(scenario.exit_year) ??
    num(terms.exit_year) ??
    null;

  const totalPct = clampPct(
    num(first(snap, [
      ["inputs", "deal_terms", "equity_pct"],
      ["inputs", "deal_terms", "total_equity_pct"],
      ["inputs", "deal_terms", "vested_equity_total_pct"],

      // App/widget payloads may be top-level deal_terms
      ["deal_terms", "equity_pct"],
      ["deal_terms", "total_equity_pct"],
      ["deal_terms", "vested_equity_total_pct"],

      ["outputs", "results", "equity_pct"],
      ["outputs", "results", "total_equity_pct"],
    ])) ??
    num(terms.equity_pct) ??
    num(terms.total_equity_pct) ??
    num(terms.vested_equity_total_pct) ??
    num(results.equity_pct) ??
    num(results.total_equity_pct),
  );

  const rawCurrentPct =
    num(first(snap, [
      ["basic_results", "vested_equity_pct"],
      ["basic_results", "vested_equity"],
      ["inputs", "vested_equity"],
      ["outputs", "results", "vested_equity_pct"],
      ["outputs", "results", "vested_equity_percent"],
      ["outputs", "results", "vested_equity"],
      ["inputs", "deal_terms", "vested_equity_pct"],
    ])) ??
    num((snap as any)?.basic_results?.vested_equity_pct) ??
    num((snap as any)?.basic_results?.vested_equity) ??
    num((snap as any)?.inputs?.vested_equity) ??
    num(results.vested_equity_pct) ??
    num(results.vested_equity_percent) ??
    num(results.vested_equity) ??
    num(terms.vested_equity_pct);

  const currentPct = totalPct !== null && rawCurrentPct === null
    ? 0
    : clampPct(rawCurrentPct);

  return {
    addressTitle,
    fmv,
    upfront,
    monthly,
    exitYear,
    vested: { currentPct, totalPct },
  };
}

export function fmtMoneyAbbrev(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

export function roundUpfront(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

export function roundMonthly(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${Math.round(n).toLocaleString("en-US")}/mo`;
}

export function fmtUpfrontPlusMonthly(
  upfront: number | null | undefined,
  monthly: number | null | undefined,
): string {
  const up = upfront != null && Number.isFinite(upfront)
    ? fmtMoneyAbbrev(Math.round(upfront / 1000) * 1000)
    : null;
  const mo = monthly != null && Number.isFinite(monthly)
    ? `${fmtMoneyAbbrev(Math.round(monthly / 100) * 100)}/mo`
    : null;
  if (up && mo) return `${up} + ${mo}`;
  if (up) return up;
  if (mo) return mo;
  return "\u2014";
}

export function fmtVestedProgress(
  currentPct: number | null | undefined,
  totalPct: number | null | undefined,
): string {
  if (totalPct == null || !Number.isFinite(totalPct)) return "Vested \u2014";
  const cur = currentPct != null && Number.isFinite(currentPct) ? Math.round(currentPct) : 0;
  return `${cur}/${Math.round(totalPct)}%`;
}
