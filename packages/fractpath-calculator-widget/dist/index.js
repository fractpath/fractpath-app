import { jsx as a, jsxs as s, Fragment as _e } from "react/jsx-runtime";
import { useState as P, useRef as Se, useEffect as ve, useMemo as q, useCallback as N } from "react";
import { createPortal as We } from "react-dom";
function E(e) {
  return Math.round((e + Number.EPSILON) * 100) / 100;
}
function Ne(e) {
  return Math.round((e + Number.EPSILON) * 1e6) / 1e6;
}
function Ue(e) {
  return Math.round((e + Number.EPSILON) * 1e4) / 1e4;
}
const Oe = 1e3, xe = 1e-10;
function le(e, t) {
  let n = 0;
  for (let r = 0; r < t.length; r++)
    n += t[r] / Math.pow(1 + e, r);
  return n;
}
function Ge(e, t) {
  let n = 0;
  for (let r = 1; r < t.length; r++)
    n += -r * t[r] / Math.pow(1 + e, r + 1);
  return n;
}
function Ke(e) {
  if (e.length < 2)
    return null;
  let t = 0.01;
  for (let n = 0; n < Oe; n++) {
    const r = le(t, e), l = Ge(t, e);
    if (Math.abs(l) < 1e-20)
      return fe(e);
    const o = t - r / l;
    if (o <= -1)
      return fe(e);
    if (Math.abs(o - t) < xe)
      return Ne(o);
    t = o;
  }
  return fe(e);
}
function fe(e) {
  let t = -0.999, n = 10;
  const r = le(t, e), l = le(n, e);
  if (r * l > 0)
    return null;
  for (let o = 0; o < Oe; o++) {
    const c = (t + n) / 2, d = le(c, e);
    if (Math.abs(d) < xe || (n - t) / 2 < xe)
      return Ne(c);
    d * le(t, e) < 0 ? n = c : t = c;
  }
  return null;
}
function Xe(e) {
  const t = Math.pow(1 + e, 12) - 1;
  return Ue(t);
}
function Je(e) {
  const t = Ke(e);
  return t === null ? 0 : Xe(t);
}
const Qe = "10.2.0";
function ue(e, t) {
  const n = Math.floor(t.exit_year * 12), r = Math.min(e.number_of_payments, n), l = E(e.upfront_payment + Ze(e.monthly_payment, r)), o = E(et(e, t)), c = tt(e, t.annual_appreciation, r), d = E(o * c), m = E(d - l), u = nt(e, t.exit_year), h = E(l + m * u), v = E(l * e.floor_multiple), b = E(l * e.ceiling_multiple), g = E(at(e.downside_mode, h, v, b)), { isa_settlement: y, dyf_floor_amount: O, dyf_applied: k } = rt(e, t.exit_year, l, g), B = E(y - l), f = E(l > 0 ? y / l : 0), A = ot(e, r, n, y), I = Je(A), z = lt(e, t.annual_appreciation, r);
  return {
    invested_capital_total: l,
    vested_equity_percentage: c,
    projected_fmv: o,
    base_equity_value: d,
    gain_above_capital: m,
    timing_factor_applied: u,
    isa_pre_floor_cap: h,
    floor_amount: v,
    ceiling_amount: b,
    isa_standard_pre_dyf: g,
    isa_settlement: y,
    dyf_floor_amount: O,
    dyf_applied: k,
    investor_profit: B,
    investor_multiple: f,
    investor_irr_annual: I,
    realtor_fee_total_projected: z.realtor_fee_total_projected,
    realtor_fee_upfront_projected: z.realtor_fee_upfront_projected,
    realtor_fee_installments_projected: z.realtor_fee_installments_projected,
    buyer_realtor_fee_total_projected: z.buyer_realtor_fee_total_projected,
    seller_realtor_fee_total_projected: z.seller_realtor_fee_total_projected,
    investor_irr_annual_net: null,
    compute_version: Qe
  };
}
function Ze(e, t) {
  return e * t;
}
function et(e, t) {
  return t.fmv_override !== void 0 && t.fmv_override !== null && t.fmv_override > 0 ? t.fmv_override : e.property_value * Math.pow(1 + t.annual_appreciation, t.exit_year);
}
function tt(e, t, n) {
  const r = e.upfront_payment / e.property_value;
  let l = 0;
  for (let o = 1; o <= n; o++) {
    const c = e.property_value * Math.pow(1 + t, o / 12);
    l += e.monthly_payment / c;
  }
  return r + l;
}
function nt(e, t) {
  return t < e.payback_window_start_year ? e.timing_factor_early : t > e.payback_window_end_year ? e.timing_factor_late : 1;
}
function at(e, t, n, r) {
  return Math.min(e === "HARD_FLOOR" ? Math.max(t, n) : t, r);
}
function rt(e, t, n, r) {
  if (!e.duration_yield_floor_enabled || e.duration_yield_floor_start_year == null || e.duration_yield_floor_min_multiple == null)
    return { isa_settlement: r, dyf_floor_amount: null, dyf_applied: !1 };
  const l = E(n * e.duration_yield_floor_min_multiple);
  return t >= e.duration_yield_floor_start_year && r < l ? { isa_settlement: l, dyf_floor_amount: l, dyf_applied: !0 } : { isa_settlement: r, dyf_floor_amount: l, dyf_applied: !1 };
}
function ot(e, t, n, r) {
  const l = new Array(n + 1).fill(0);
  l[0] = -e.upfront_payment;
  for (let o = 1; o <= t; o++)
    l[o] = -e.monthly_payment;
  return l[n] += r, l;
}
function lt(e, t, n) {
  if (e.realtor_commission_payment_mode !== "PER_PAYMENT_EVENT")
    throw new Error(`realtor_commission_payment_mode must be "PER_PAYMENT_EVENT" in v10.2, got "${e.realtor_commission_payment_mode}"`);
  const r = e.realtor_representation_mode !== "NONE" ? e.realtor_commission_pct : 0;
  if (r === 0)
    return {
      realtor_fee_total_projected: 0,
      realtor_fee_upfront_projected: 0,
      realtor_fee_installments_projected: 0,
      buyer_realtor_fee_total_projected: 0,
      seller_realtor_fee_total_projected: 0
    };
  const l = E(e.upfront_payment * r), o = E(e.monthly_payment * n * r), c = E(l + o);
  let d = 0, m = 0, u = e.upfront_payment / e.property_value;
  const h = e.upfront_payment * r;
  d += h * u, m += h * (1 - u);
  for (let v = 1; v <= n; v++) {
    const b = e.property_value * Math.pow(1 + t, v / 12);
    u += e.monthly_payment / b;
    const g = e.monthly_payment * r;
    d += g * u, m += g * (1 - u);
  }
  return {
    realtor_fee_total_projected: c,
    realtor_fee_upfront_projected: l,
    realtor_fee_installments_projected: o,
    buyer_realtor_fee_total_projected: E(d),
    seller_realtor_fee_total_projected: E(m)
  };
}
const it = 0.03, st = 0.035, ct = 0.045, mt = 0.025, dt = 1.1, ut = 2, pt = 0.01, _t = 0.03, ft = 0.1, yt = 25e-4, ye = {
  homeValue: 6e5,
  initialBuyAmount: 1e5,
  termYears: 10,
  annualGrowthRate: it,
  transferFeeRate_standard: st,
  transferFeeRate_early: ct,
  transferFeeRate_late: mt,
  floorMultiple: dt,
  capMultiple: ut,
  vesting: {
    upfrontEquityPct: ft,
    monthlyEquityPct: yt,
    months: 120
  },
  cpw: {
    startPct: pt,
    endPct: _t
  }
}, ht = (e, t, n) => Math.min(n, Math.max(t, e));
function bt(e) {
  const t = {
    ...ye,
    ...e,
    vesting: {
      ...ye.vesting,
      ...e.vesting ?? {}
    },
    cpw: {
      ...ye.cpw,
      ...e.cpw ?? {}
    }
  }, n = Math.max(0, Math.round(t.termYears * 12));
  return t.vesting.months = n, t;
}
function gt(e, t, n) {
  const r = n / 12;
  return e * Math.pow(1 + t, r);
}
function vt(e, t, n) {
  return ht(e + t * n, 0, 1);
}
function xt(e, t) {
  const n = [];
  for (let r = 0; r <= t; r++) {
    const l = gt(e.homeValue, e.annualGrowthRate, r), o = vt(
      e.vesting.upfrontEquityPct,
      e.vesting.monthlyEquityPct,
      r
    );
    n.push({
      month: r,
      year: r / 12,
      homeValue: l,
      equityPct: o
    });
  }
  return n;
}
function de(e, t) {
  const n = e.vesting.months;
  return t === "standard" ? n : t === "early" ? Math.min(36, n) : t === "late" ? n + 24 : n;
}
function wt(e) {
  return {
    property_value: e.homeValue,
    upfront_payment: e.initialBuyAmount,
    monthly_payment: e.vesting.monthlyEquityPct * e.homeValue,
    number_of_payments: e.vesting.months,
    // Payback window + timing factors:
    // The legacy widget had TF as a transfer fee rate; canonical compute uses timing factor multipliers.
    // Until UI collects these, we default to neutral (1) and place window across the term.
    payback_window_start_year: Math.max(0, Math.floor(e.termYears / 3)),
    payback_window_end_year: Math.max(1, Math.ceil(e.termYears * 2 / 3)),
    timing_factor_early: 1,
    timing_factor_late: 1,
    floor_multiple: e.floorMultiple,
    ceiling_multiple: e.capMultiple,
    downside_mode: "HARD_FLOOR",
    // Not currently modeled in widget UI; keep deterministic defaults.
    contract_maturity_years: 30,
    liquidity_trigger_year: 13,
    minimum_hold_years: 2,
    platform_fee: 0,
    servicing_fee_monthly: 0,
    exit_fee_pct: 0,
    // DYF defaults (disabled)
    duration_yield_floor_enabled: !1,
    duration_yield_floor_start_year: null,
    duration_yield_floor_min_multiple: null,
    realtor_representation_mode: "NONE",
    realtor_commission_pct: 0,
    realtor_commission_payment_mode: "PER_PAYMENT_EVENT"
  };
}
function he(e, t) {
  const n = de(e, t), r = n / 12, l = wt(e), o = ue(l, {
    annual_appreciation: e.annualGrowthRate,
    exit_year: r
  }), c = o.isa_settlement === o.isa_pre_floor_cap ? "none" : o.isa_settlement === o.floor_amount ? "floor" : o.isa_settlement === o.ceiling_amount ? "cap" : "none", d = 0, m = 0, u = o.isa_settlement;
  return {
    timing: t,
    settlementMonth: n,
    homeValueAtSettlement: o.projected_fmv,
    equityPctAtSettlement: o.vested_equity_percentage,
    rawPayout: o.isa_pre_floor_cap,
    clampedPayout: o.isa_settlement,
    transferFeeAmount: m,
    netPayout: u,
    clamp: { floor: o.floor_amount, cap: o.ceiling_amount, applied: c },
    transferFeeRate: d
  };
}
function St(e = {}) {
  const t = bt(e), n = Math.max(
    de(t, "standard"),
    de(t, "early"),
    de(t, "late")
  ), r = xt(t, n), l = he(t, "standard"), o = he(t, "early"), c = he(t, "late");
  return {
    normalizedInputs: t,
    series: r,
    settlements: { standard: l, early: o, late: c }
  };
}
function kt(e) {
  const t = e.series.map((r) => ({
    month: r.month,
    year: r.year,
    homeValue: r.homeValue,
    equityPct: r.equityPct
  })), n = ["early", "standard", "late"].map((r) => {
    const l = e.settlements[r];
    return {
      timing: r,
      month: l.settlementMonth,
      year: l.settlementMonth / 12,
      homeValueAtSettlement: l.homeValueAtSettlement,
      equityPctAtSettlement: l.equityPctAtSettlement,
      netPayout: l.netPayout
    };
  });
  return { points: t, markers: n };
}
function Rt(e, t, n) {
  return Math.min(n, Math.max(t, e));
}
function Pt(e) {
  return `${Math.round(e * 100)}%`;
}
function Ft(e) {
  return `${Math.round(e * 10) / 10}y`;
}
function Mt(e) {
  return e.timing === "early" ? "Early" : e.timing === "late" ? "Late" : "Std";
}
function Et({ series: e, width: t = 640, height: n = 240 }) {
  const { points: r, markers: l } = e;
  if (!r.length)
    return /* @__PURE__ */ a("div", { style: { fontFamily: "system-ui, sans-serif" }, children: "No data" });
  const o = { top: 16, right: 16, bottom: 28, left: 44 }, c = Math.max(10, t - o.left - o.right), d = Math.max(10, n - o.top - o.bottom), m = r[0].month, u = r[r.length - 1].month, h = 0, v = 1, b = (f) => u === m ? o.left : o.left + (f - m) / (u - m) * c, g = (f) => {
    const A = Rt(f, h, v);
    return o.top + (1 - (A - h) / (v - h)) * d;
  }, y = r.map((f, A) => {
    const I = b(f.month), z = g(f.equityPct);
    return `${A === 0 ? "M" : "L"} ${I.toFixed(2)} ${z.toFixed(2)}`;
  }).join(" "), O = [0, 0.5, 1].map((f) => ({
    v: f,
    y: g(f),
    label: Pt(f)
  })), k = Math.round((m + u) / 2), B = [m, k, u].map((f) => ({
    m: f,
    x: b(f),
    label: Ft(f / 12)
  }));
  return /* @__PURE__ */ s(
    "svg",
    {
      width: t,
      height: n,
      role: "img",
      "aria-label": "Equity over time",
      style: { display: "block" },
      children: [
        /* @__PURE__ */ a("rect", { x: 0, y: 0, width: t, height: n, fill: "white" }),
        O.map((f) => /* @__PURE__ */ s("g", { children: [
          /* @__PURE__ */ a(
            "line",
            {
              x1: o.left,
              x2: t - o.right,
              y1: f.y,
              y2: f.y,
              stroke: "#e5e7eb",
              strokeWidth: 1
            }
          ),
          /* @__PURE__ */ a(
            "text",
            {
              x: o.left - 8,
              y: f.y + 4,
              fontSize: 12,
              textAnchor: "end",
              fill: "#6b7280",
              fontFamily: "system-ui, sans-serif",
              children: f.label
            }
          )
        ] }, f.v)),
        /* @__PURE__ */ a(
          "line",
          {
            x1: o.left,
            x2: t - o.right,
            y1: o.top + d,
            y2: o.top + d,
            stroke: "#e5e7eb",
            strokeWidth: 1
          }
        ),
        B.map((f) => /* @__PURE__ */ s("g", { children: [
          /* @__PURE__ */ a(
            "line",
            {
              x1: f.x,
              x2: f.x,
              y1: o.top + d,
              y2: o.top + d + 6,
              stroke: "#9ca3af",
              strokeWidth: 1
            }
          ),
          /* @__PURE__ */ a(
            "text",
            {
              x: f.x,
              y: o.top + d + 20,
              fontSize: 12,
              textAnchor: "middle",
              fill: "#6b7280",
              fontFamily: "system-ui, sans-serif",
              children: f.label
            }
          )
        ] }, f.m)),
        l.map((f) => {
          const A = b(f.month);
          return /* @__PURE__ */ s("g", { children: [
            /* @__PURE__ */ a(
              "line",
              {
                x1: A,
                x2: A,
                y1: o.top,
                y2: o.top + d,
                stroke: "#d1d5db",
                strokeWidth: 1,
                strokeDasharray: "4 4"
              }
            ),
            /* @__PURE__ */ a(
              "rect",
              {
                x: A - 16,
                y: o.top - 2,
                width: 32,
                height: 16,
                rx: 6,
                fill: "#f3f4f6",
                stroke: "#e5e7eb"
              }
            ),
            /* @__PURE__ */ a(
              "text",
              {
                x: A,
                y: o.top + 10,
                fontSize: 11,
                textAnchor: "middle",
                fill: "#374151",
                fontFamily: "system-ui, sans-serif",
                children: Mt(f)
              }
            )
          ] }, f.timing);
        }),
        /* @__PURE__ */ a("path", { d: y, fill: "none", stroke: "#111827", strokeWidth: 2 }),
        /* @__PURE__ */ a(
          "text",
          {
            x: o.left,
            y: 14,
            fontSize: 12,
            fill: "#374151",
            fontFamily: "system-ui, sans-serif",
            children: "Equity ownership over time"
          }
        )
      ]
    }
  );
}
function R(e) {
  return e.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  });
}
function J(e) {
  return `${(e * 100).toFixed(1)}%`;
}
function ke(e) {
  const t = Math.floor(e / 12), n = e % 12;
  return t === 0 ? `${n}mo` : n === 0 ? `${t}yr` : `${t}yr ${n}mo`;
}
const Re = {
  homeowner: {
    heroLabel: "Your Net Payout",
    heroValue: (e) => e.settlements.standard.netPayout,
    helperText: "Estimated net payout at standard settlement timing."
  },
  buyer: {
    heroLabel: "Projected Net Return",
    heroValue: (e) => e.settlements.standard.netPayout,
    helperText: "Projected net return at standard settlement timing."
  },
  investor: {
    heroLabel: "Projected Net Return",
    heroValue: (e) => e.settlements.standard.netPayout,
    helperText: "Projected net return at standard settlement timing."
  },
  realtor: {
    heroLabel: "Standard Net Payout",
    heroValue: (e) => e.settlements.standard.netPayout,
    helperText: "Standard net payout for commission reference."
  },
  ops: {
    heroLabel: "Standard Net Payout",
    heroValue: (e) => e.settlements.standard.netPayout,
    helperText: "Standard net payout at projected settlement."
  }
};
function Fn(e) {
  return Re[e] ?? Re.homeowner;
}
const At = {
  homeowner: {
    "deal_terms.property_value": "Your Home Value",
    "deal_terms.upfront_payment": "Initial Payment",
    "scenario.exit_year": "When You'd Settle"
  },
  buyer: {
    "deal_terms.property_value": "Property Value",
    "deal_terms.upfront_payment": "Upfront Investment",
    "scenario.exit_year": "Target Exit Year"
  },
  investor: {
    "deal_terms.property_value": "Asset Value",
    "deal_terms.upfront_payment": "Capital Deployed",
    "scenario.exit_year": "Target Exit Year",
    "deal_terms.monthly_payment": "Monthly Tranche"
  },
  realtor: {
    "deal_terms.property_value": "Property Value",
    "deal_terms.upfront_payment": "Upfront Payment",
    "deal_terms.realtor_commission_pct": "Your Commission (%)",
    "deal_terms.realtor_representation_mode": "Your Representation"
  },
  ops: {
    "deal_terms.property_value": "Property Value (FMV)",
    "deal_terms.upfront_payment": "Upfront Payment"
  }
};
function ee(e, t, n) {
  return At[t]?.[e] ?? n;
}
const Pe = {
  homeowner: ["hero", "net_payout", "settlement_timing", "total_invested", "fees"],
  buyer: ["hero", "net_payout", "total_invested", "settlement_timing", "fees"],
  investor: ["hero", "net_payout", "total_invested", "fees", "settlement_timing"],
  realtor: ["hero", "fees", "net_payout", "settlement_timing", "total_invested"],
  ops: ["hero", "net_payout", "fees", "total_invested", "settlement_timing"]
};
function Mn(e) {
  return Pe[e] ?? Pe.homeowner;
}
const L = {
  platform_fee: 2500,
  servicing_fee_monthly: 49,
  exit_fee_pct: 0.01
}, te = "10.2.0", ne = "1";
function ze(e) {
  const t = {};
  for (const n of Object.keys(e).sort()) {
    const r = e[n];
    r !== null && typeof r == "object" && !Array.isArray(r) ? t[n] = ze(r) : t[n] = r;
  }
  return JSON.stringify(t);
}
async function ae(e) {
  const t = ze(e), n = new TextEncoder().encode(t), r = await crypto.subtle.digest("SHA-256", n);
  return Array.from(new Uint8Array(r)).map((o) => o.toString(16).padStart(2, "0")).join("");
}
function Ie(e) {
  return {
    homeValue: e.homeValue,
    initialBuyAmount: e.initialBuyAmount,
    termYears: e.termYears,
    annualGrowthRate: e.annualGrowthRate
  };
}
function Tt(e) {
  return {
    standard_net_payout: e.settlements.standard.netPayout,
    early_net_payout: e.settlements.early.netPayout,
    late_net_payout: e.settlements.late.netPayout,
    standard_settlement_month: e.settlements.standard.settlementMonth,
    early_settlement_month: e.settlements.early.settlementMonth,
    late_settlement_month: e.settlements.late.settlementMonth
  };
}
function Dt(e) {
  return {
    standard_net_payout: e.settlements.standard.netPayout,
    early_net_payout: e.settlements.early.netPayout,
    late_net_payout: e.settlements.late.netPayout
  };
}
async function En(e, t, n) {
  const r = Ie(t), l = Tt(n), [o, c] = await Promise.all([
    ae(r),
    ae(l)
  ]);
  return {
    contract_version: te,
    schema_version: ne,
    persona: e,
    mode: "marketing",
    inputs: r,
    basic_results: l,
    input_hash: o,
    output_hash: c,
    created_at: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function An(e, t, n) {
  return {
    contract_version: te,
    schema_version: ne,
    persona: e,
    inputs: Ie(t),
    basic_results: Dt(n),
    created_at: (/* @__PURE__ */ new Date()).toISOString()
  };
}
async function Tn(e, t, n) {
  const [r, l] = await Promise.all([
    ae(t),
    ae({
      standard: n.settlements.standard,
      early: n.settlements.early,
      late: n.settlements.late
    })
  ]);
  return {
    contract_version: te,
    schema_version: ne,
    persona: e,
    mode: "app",
    inputs: t,
    outputs: n,
    input_hash: r,
    output_hash: l,
    created_at: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function Ct(e) {
  return {
    property_value: e.homeValue,
    upfront_payment: e.initialBuyAmount,
    // Default: monthly_payment derived from vesting schedule; 0 if absent
    monthly_payment: e.vesting?.monthlyEquityPct ? e.vesting.monthlyEquityPct * e.homeValue : 0,
    number_of_payments: e.vesting?.months ?? e.termYears * 12,
    // Default payback windows: start at year 3, end at contract maturity
    payback_window_start_year: 3,
    payback_window_end_year: e.termYears,
    // Default timing factors: 0.85 early penalty, 1.10 late bonus
    timing_factor_early: 0.85,
    timing_factor_late: 1.1,
    floor_multiple: e.floorMultiple,
    ceiling_multiple: e.capMultiple,
    downside_mode: "HARD_FLOOR",
    contract_maturity_years: e.termYears,
    // Default: liquidity trigger at 70% of term
    liquidity_trigger_year: Math.floor(e.termYears * 0.7),
    // Default: minimum 1-year hold
    minimum_hold_years: 1,
    platform_fee: L.platform_fee,
    servicing_fee_monthly: L.servicing_fee_monthly,
    exit_fee_pct: L.exit_fee_pct,
    // Default realtor: NONE with 0 commission, PER_PAYMENT_EVENT locked
    realtor_representation_mode: "NONE",
    realtor_commission_pct: 0,
    realtor_commission_payment_mode: "PER_PAYMENT_EVENT"
  };
}
function Nt(e) {
  return {
    annual_appreciation: e.annualGrowthRate,
    // Default: 2% closing costs
    closing_cost_pct: 0.02,
    exit_year: e.termYears
  };
}
function Ot(e) {
  const t = Ct(e), n = Nt(e), r = ue(t, n), l = (/* @__PURE__ */ new Date()).toISOString();
  return {
    contract_version: te,
    schema_version: ne,
    deal_terms: t,
    assumptions: n,
    outputs: r,
    now_iso: l,
    created_at: l
  };
}
function Y(e, t) {
  switch (t) {
    case "currency":
      return R(e);
    case "percent":
      return J(e);
    case "multiple":
      return `${e.toFixed(2)}×`;
    case "months":
      return `${e}`;
    case "text":
      return String(e);
  }
}
function zt(e, t, n, r) {
  switch (e) {
    case "homeowner":
      return $t(t, n, r);
    case "realtor":
      return Yt(t, n, r);
    default:
      return It(t, n, r);
  }
}
function It(e, t, n) {
  const r = n.investor_profit, l = n.isa_settlement, o = n.invested_capital_total, c = n.projected_fmv, d = n.investor_multiple, m = c > 0 ? l / c : 0;
  return {
    hero: {
      label: "Projected Net Return",
      value: r,
      valueFormat: "currency",
      subtitle: `Profit at standard settlement (Year ${t.exit_year}).`
    },
    strip: [
      { label: "Net payout at settlement", value: l, valueFormat: "currency" },
      { label: "Total cash paid", value: o, valueFormat: "currency" },
      { label: "Projected home value", value: c, valueFormat: "currency" },
      { label: "Implied equity share", value: m, valueFormat: "percent" },
      { label: "Return multiple", value: d, valueFormat: "multiple" }
    ],
    chartSpec: {
      type: "bar",
      bars: [
        { label: "Total cash paid", value: o },
        { label: "Settlement payout", value: l },
        { label: "Projected home value", value: c }
      ]
    },
    marketingBullets: [
      `~${Y(m, "percent")} equity built over ${t.exit_year} years — with no financing or interest.`,
      `You contribute ${Y(o, "currency")} total. At settlement, payout is ${Y(l, "currency")}.`,
      `Projected home value at settlement: ${Y(c, "currency")} (base assumptions).`,
      `Assumes ${Y(t.annual_appreciation, "percent")} annual appreciation — Save & Continue free to model different growth and timing.`
    ]
  };
}
function $t(e, t, n) {
  const r = n.invested_capital_total, l = n.projected_fmv;
  return {
    hero: {
      label: "Lifetime Cash Unlocked",
      value: r,
      valueFormat: "currency",
      subtitle: "Cash received over the deal term (upfront + installments)."
    },
    strip: [
      { label: "Upfront cash received", value: e.upfront_payment, valueFormat: "currency" },
      { label: "Monthly cash received", value: e.monthly_payment, valueFormat: "currency" },
      { label: "Installment months", value: e.number_of_payments, valueFormat: "months" },
      { label: "Total cash unlocked", value: r, valueFormat: "currency" },
      { label: "Projected home value", value: l, valueFormat: "currency" }
    ],
    chartSpec: {
      type: "bar",
      bars: [
        { label: "Cash unlocked", value: r },
        { label: "Projected home value", value: l }
      ]
    },
    marketingBullets: [
      `Unlock ${Y(r, "currency")} while continuing to own your home.`,
      `Upfront: ${Y(e.upfront_payment, "currency")}. Monthly: ${Y(e.monthly_payment, "currency")} for ${e.number_of_payments} months.`,
      `Projected home value at settlement: ${Y(l, "currency")} (base assumptions).`,
      `Assumes ${Y(t.annual_appreciation, "percent")} annual appreciation — Save & Continue free to model growth, protections, and timing.`
    ]
  };
}
function Yt(e, t, n) {
  const r = n.realtor_fee_total_projected, l = n.isa_settlement, c = n.projected_fmv - l, d = e.realtor_commission_pct * 100;
  return {
    hero: {
      label: "Projected Commission (Standard)",
      value: r,
      valueFormat: "currency",
      subtitle: `Based on ${d.toFixed(1)}% as ${e.realtor_representation_mode} representation.`
    },
    strip: [
      { label: "Commission rate", value: `${d.toFixed(1)}%`, valueFormat: "text" },
      { label: "Representation", value: e.realtor_representation_mode, valueFormat: "text" },
      { label: "Commission from this deal", value: r, valueFormat: "currency" },
      {
        label: "Remaining opportunity",
        value: c > 0 ? c : 0,
        valueFormat: "currency"
      }
    ],
    chartSpec: {
      type: "bar",
      bars: [
        { label: "Commission on this deal", value: r },
        { label: "Remaining opportunity", value: c > 0 ? c : 0 }
      ]
    },
    marketingBullets: [
      `Projected commission on this deal: ${Y(r, "currency")} (standard timing).`,
      `Commission rate: ${d.toFixed(1)}% as ${e.realtor_representation_mode} representation.`,
      "Capture buyers and sellers earlier — without requiring an immediate full sale or full purchase.",
      `Remaining property value at settlement (conditional): ${Y(c > 0 ? c : 0, "currency")}. Save free to model scenarios.`
    ]
  };
}
function Lt({ bars: e, width: t = 480, height: n = 200 }) {
  const r = Math.max(...e.map((u) => u.value), 1), l = Math.min(80, (t - 40) / e.length - 20), o = 30, c = n - 40, d = c - o, m = (t - 20) / e.length;
  return /* @__PURE__ */ a(
    "svg",
    {
      width: t,
      height: n,
      viewBox: `0 0 ${t} ${n}`,
      style: { display: "block", margin: "0 auto" },
      "data-testid": "simple-bar-chart",
      children: e.map((u, h) => {
        const v = r > 0 ? u.value / r * d : 0, b = 10 + h * m + (m - l) / 2, g = c - v, y = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"], O = y[h % y.length];
        return /* @__PURE__ */ s("g", { children: [
          /* @__PURE__ */ a(
            "rect",
            {
              x: b,
              y: g,
              width: l,
              height: Math.max(v, 1),
              rx: 4,
              fill: O
            }
          ),
          /* @__PURE__ */ a(
            "text",
            {
              x: b + l / 2,
              y: g - 6,
              textAnchor: "middle",
              fontSize: 10,
              fontWeight: 600,
              fill: "#374151",
              fontFamily: "system-ui, sans-serif",
              children: R(u.value)
            }
          ),
          /* @__PURE__ */ a(
            "text",
            {
              x: b + l / 2,
              y: c + 14,
              textAnchor: "middle",
              fontSize: 9,
              fill: "#6b7280",
              fontFamily: "system-ui, sans-serif",
              children: u.label.length > 18 ? u.label.slice(0, 16) + "…" : u.label
            }
          )
        ] }, h);
      })
    }
  );
}
const jt = [
  {
    key: "deal_terms.property_value",
    label: "Property value (FMV)",
    unit: "currency",
    control: "slider",
    simpleDefinition: "How much the home is worth right now.",
    impact: "It affects how much equity your payments buy and how the deal grows over time.",
    formula: "equity_upfront = upfront_payment / property_value; property_value_m starts from property_value",
    slider: { min: 1e5, max: 3e6, step: 1e4 },
    recommendedRange: { min: 2e5, max: 15e5 },
    hardRange: { min: 1e5, max: 3e6 },
    sectionHint: "Payments"
  },
  {
    key: "deal_terms.upfront_payment",
    label: "Upfront payment",
    unit: "currency",
    control: "kiosk",
    simpleDefinition: "Money paid at the start of the deal.",
    impact: "It buys equity right away. For MVP, upfront payment is capped so total equity transfer can't exceed a safe share of the home value.",
    formula: "invested_capital_total = upfront_payment + monthly_payment * payments_made_by_exit; equity_upfront = upfront_payment / property_value",
    dynamicPercentAnchors: {
      sourceKey: "deal_terms.property_value",
      percents: [0.05, 0.1, 0.15, 0.2],
      rounding: "nearest_100",
      min: 0,
      maxPercentOfSource: 0.5,
      labelPercents: ["5%", "10%", "15%", "20%"]
    },
    recommendedRange: { min: 0, max: 3e5 },
    hardRange: { min: 0, max: 15e5 },
    sectionHint: "Payments"
  },
  {
    key: "deal_terms.monthly_payment",
    label: "Monthly payment",
    unit: "currency",
    control: "kiosk",
    simpleDefinition: "Money paid each month during the deal.",
    impact: "Monthly payments buy equity over time, based on the home value each month.",
    formula: "equity_m = monthly_payment / property_value_m",
    dynamicPercentAnchors: {
      sourceKey: "deal_terms.property_value",
      percents: [0, 1e-3, 2e-3, 3e-3],
      rounding: "nearest_100",
      min: 0,
      labelPercents: ["0%", "0.1%", "0.2%", "0.3%"]
    },
    recommendedRange: { min: 0, max: 3e3 },
    hardRange: { min: 0, max: 25e3 },
    sectionHint: "Payments"
  },
  {
    key: "deal_terms.number_of_payments",
    label: "Number of monthly payments",
    unit: "months",
    control: "slider",
    simpleDefinition: "How many monthly payments you plan to make.",
    impact: "More months means more total payments and more equity purchased over time.",
    formula: "payments_made_by_exit = min(number_of_payments, exit_month)",
    slider: { min: 0, max: 120, step: 1 },
    recommendedRange: { min: 0, max: 120 },
    hardRange: { min: 0, max: 120 },
    sectionHint: "Payments"
  },
  {
    key: "scenario.annual_appreciation",
    label: "Annual appreciation",
    unit: "percent",
    control: "kiosk",
    simpleDefinition: "How fast the home value grows (or drops) each year.",
    impact: "It changes the future home value, which changes how much equity each monthly payment buys.",
    formula: "property_value_m = property_value * (1 + annual_appreciation)^(m/12)",
    anchors: [
      { label: "0%", value: 0 },
      { label: "2%", value: 0.02 },
      { label: "4%", value: 0.04 },
      { label: "6%", value: 0.06 }
    ],
    recommendedRange: { min: -0.05, max: 0.08 },
    hardRange: { min: -0.5, max: 0.5 },
    sectionHint: "Assumptions"
  },
  {
    key: "scenario.exit_year",
    label: "Exit year",
    unit: "years",
    control: "kiosk",
    simpleDefinition: "When the deal ends (like 5 years).",
    impact: "It sets how long the equity has to grow and how many payments count before exit.",
    formula: "exit_month = floor(exit_year * 12); projected_fmv = property_value * (1 + annual_appreciation)^exit_year",
    anchors: [
      { label: "3", value: 3 },
      { label: "5", value: 5 },
      { label: "7", value: 7 },
      { label: "10", value: 10 }
    ],
    recommendedRange: { min: 3, max: 10 },
    hardRange: { min: 0.5, max: 30 },
    sectionHint: "Assumptions"
  },
  {
    key: "scenario.closing_cost_pct",
    label: "Closing costs (%)",
    unit: "percent",
    control: "kiosk",
    simpleDefinition: "Extra costs paid when the deal closes (as a percent).",
    impact: "Closing costs reduce the net proceeds at exit and can change the settlement amount.",
    formula: "net_at_exit = gross_at_exit - (closing_cost_pct * projected_fmv) (conceptual)",
    anchors: [
      { label: "0%", value: 0 },
      { label: "1%", value: 0.01 },
      { label: "2%", value: 0.02 },
      { label: "3%", value: 0.03 }
    ],
    recommendedRange: { min: 0, max: 0.04 },
    hardRange: { min: 0, max: 0.1 },
    sectionHint: "Assumptions"
  },
  {
    key: "deal_terms.floor_multiple",
    label: "Floor multiple",
    unit: "number",
    control: "kiosk",
    simpleDefinition: "The minimum return multiple allowed at settlement.",
    impact: "It protects one side from getting too little back if the home performs poorly.",
    formula: "settlement_multiple = max(floor_multiple, raw_multiple) (then capped by ceiling)",
    anchors: [
      { label: "1.00×", value: 1 },
      { label: "1.05×", value: 1.05 },
      { label: "1.10×", value: 1.1 },
      { label: "1.20×", value: 1.2 }
    ],
    recommendedRange: { min: 1, max: 1.2 },
    hardRange: { min: 0.5, max: 2 },
    sectionHint: "Protections"
  },
  {
    key: "deal_terms.ceiling_multiple",
    label: "Ceiling multiple",
    unit: "number",
    control: "kiosk",
    simpleDefinition: "The maximum return multiple allowed at settlement.",
    impact: "It caps outcomes so the settlement can't grow beyond the agreed maximum.",
    formula: "settlement_multiple = min(ceiling_multiple, settlement_multiple_after_floor)",
    anchors: [
      { label: "1.30×", value: 1.3 },
      { label: "1.50×", value: 1.5 },
      { label: "1.75×", value: 1.75 },
      { label: "2.00×", value: 2 }
    ],
    recommendedRange: { min: 1.3, max: 2 },
    hardRange: { min: 1, max: 3 },
    sectionHint: "Protections"
  },
  {
    key: "deal_terms.downside_mode",
    label: "Downside protection",
    unit: "enum",
    control: "enum",
    simpleDefinition: "A rule for what happens if the home value goes down.",
    impact: "It changes how the floor is enforced and how downside risk is shared.",
    formula: "downside_mode adjusts settlement floor rules in negative scenarios (conceptual)",
    options: [
      { label: "Hard floor", value: "HARD_FLOOR" },
      { label: "No floor", value: "NO_FLOOR" }
    ],
    sectionHint: "Protections"
  },
  {
    key: "deal_terms.payback_window_start_year",
    label: "Payback window start",
    unit: "years",
    control: "kiosk",
    simpleDefinition: "When the 'timing window' starts.",
    impact: "Timing rules can change equity earned depending on when payments happen in this window.",
    formula: "window_start_month = floor(payback_window_start_year * 12)",
    anchors: [
      { label: "0", value: 0 },
      { label: "1", value: 1 },
      { label: "2", value: 2 },
      { label: "3", value: 3 }
    ],
    recommendedRange: { min: 0, max: 3 },
    hardRange: { min: 0, max: 30 },
    sectionHint: "Protections"
  },
  {
    key: "deal_terms.payback_window_end_year",
    label: "Payback window end",
    unit: "years",
    control: "kiosk",
    simpleDefinition: "When the 'timing window' ends.",
    impact: "It defines how long timing adjustments can apply to equity earned.",
    formula: "window_end_month = floor(payback_window_end_year * 12)",
    anchors: [
      { label: "3", value: 3 },
      { label: "5", value: 5 },
      { label: "7", value: 7 },
      { label: "10", value: 10 }
    ],
    recommendedRange: { min: 3, max: 10 },
    hardRange: { min: 0, max: 30 },
    sectionHint: "Protections"
  },
  {
    key: "deal_terms.timing_factor_early",
    label: "Timing factor (early)",
    unit: "number",
    control: "kiosk",
    simpleDefinition: "A multiplier that can reward earlier payments (inside the timing window).",
    impact: "It can increase or decrease equity earned for payments made earlier in the window.",
    formula: "equity_adjusted_m = equity_m * timing_factor_early (when 'early' in window)",
    anchors: [
      { label: "0.90×", value: 0.9 },
      { label: "1.00×", value: 1 },
      { label: "1.10×", value: 1.1 },
      { label: "1.20×", value: 1.2 }
    ],
    recommendedRange: { min: 0.9, max: 1.2 },
    hardRange: { min: 0.5, max: 2 },
    sectionHint: "Protections"
  },
  {
    key: "deal_terms.timing_factor_late",
    label: "Timing factor (late)",
    unit: "number",
    control: "kiosk",
    simpleDefinition: "A multiplier that can reward or penalize later payments (inside the timing window).",
    impact: "It can increase or decrease equity earned for payments made later in the window.",
    formula: "equity_adjusted_m = equity_m * timing_factor_late (when 'late' in window)",
    anchors: [
      { label: "0.80×", value: 0.8 },
      { label: "0.90×", value: 0.9 },
      { label: "1.00×", value: 1 },
      { label: "1.10×", value: 1.1 }
    ],
    recommendedRange: { min: 0.8, max: 1.1 },
    hardRange: { min: 0.5, max: 2 },
    sectionHint: "Protections"
  },
  {
    key: "deal_terms.minimum_hold_years",
    label: "Minimum hold (years)",
    unit: "years",
    control: "kiosk",
    simpleDefinition: "The shortest time the deal must stay active before it can end.",
    impact: "It prevents very early exits and can change settlement timing and outcomes.",
    formula: "minimum_hold_month = floor(minimum_hold_years * 12) (conceptual constraint)",
    anchors: [
      { label: "1", value: 1 },
      { label: "2", value: 2 },
      { label: "3", value: 3 },
      { label: "5", value: 5 }
    ],
    recommendedRange: { min: 0, max: 3 },
    hardRange: { min: 0, max: 10 },
    sectionHint: "Ownership"
  },
  {
    key: "deal_terms.contract_maturity_years",
    label: "Contract maturity (years)",
    unit: "years",
    control: "kiosk",
    simpleDefinition: "The maximum time the agreement can run before it must settle or convert.",
    impact: "It defines a hard endpoint so deals can't run forever.",
    formula: "maturity_month = floor(contract_maturity_years * 12) (conceptual limit)",
    anchors: [
      { label: "5", value: 5 },
      { label: "7", value: 7 },
      { label: "10", value: 10 },
      { label: "15", value: 15 }
    ],
    recommendedRange: { min: 5, max: 15 },
    hardRange: { min: 1, max: 30 },
    sectionHint: "Ownership"
  },
  {
    key: "deal_terms.liquidity_trigger_year",
    label: "Liquidity trigger year",
    unit: "years",
    control: "kiosk",
    simpleDefinition: "The year when a liquidity event can be triggered.",
    impact: "It sets when the deal may allow early buyout or conversion options.",
    formula: "liquidity_trigger_month = floor(liquidity_trigger_year * 12) (conceptual threshold)",
    anchors: [
      { label: "5", value: 5 },
      { label: "10", value: 10 },
      { label: "15", value: 15 },
      { label: "20", value: 20 }
    ],
    recommendedRange: { min: 5, max: 20 },
    hardRange: { min: 1, max: 30 },
    sectionHint: "Ownership"
  },
  {
    key: "deal_terms.platform_fee",
    label: "Platform fee (system)",
    unit: "currency",
    control: "readonly",
    readOnly: !0,
    simpleDefinition: "A fee paid to FractPath for running the deal.",
    impact: "This is set by the system and reduces the net proceeds at settlement.",
    formula: "net_settlement = gross_settlement - platform_fee (conceptual)",
    recommendedRange: { min: 0, max: 5e3 },
    hardRange: { min: 0, max: 5e4 },
    sectionHint: "Fees"
  },
  {
    key: "deal_terms.servicing_fee_monthly",
    label: "Servicing fee (monthly)",
    unit: "currency",
    control: "readonly",
    readOnly: !0,
    simpleDefinition: "A monthly fee for servicing the deal.",
    impact: "It accumulates over the life of the deal and reduces net investor returns.",
    formula: "servicing_total = servicing_fee_monthly * payments_made_by_exit",
    recommendedRange: { min: 0, max: 100 },
    hardRange: { min: 0, max: 500 },
    sectionHint: "Fees"
  },
  {
    key: "deal_terms.exit_fee_pct",
    label: "Exit fee (%) (system)",
    unit: "percent",
    control: "readonly",
    readOnly: !0,
    simpleDefinition: "A fee charged when the deal ends (as a percent).",
    impact: "This is set by the system and reduces the net settlement at exit.",
    formula: "exit_fee = exit_fee_pct * gross_settlement; net_settlement = gross_settlement - exit_fee",
    recommendedRange: { min: 0, max: 0.02 },
    hardRange: { min: 0, max: 0.1 },
    sectionHint: "Fees"
  },
  {
    key: "deal_terms.realtor_representation_mode",
    label: "Realtor representation",
    unit: "enum",
    control: "enum",
    simpleDefinition: "Whether a realtor is involved and which side they represent.",
    impact: "It determines if a realtor commission applies and how it is allocated.",
    formula: "if mode = NONE then realtor_commission_pct is treated as 0 in compute",
    options: [
      { label: "None", value: "NONE" },
      { label: "Buyer", value: "BUYER" },
      { label: "Seller", value: "SELLER" },
      { label: "Dual", value: "DUAL" }
    ],
    sectionHint: "Fees"
  },
  {
    key: "deal_terms.realtor_commission_pct",
    label: "Realtor commission (%)",
    unit: "percent",
    control: "kiosk",
    simpleDefinition: "The percentage paid to the realtor for their services.",
    impact: "It reduces net proceeds. Capped at 6%. Must be 0 when representation is NONE.",
    formula: "commission_amount = realtor_commission_pct * settlement_value (conceptual, per payment event)",
    anchors: [
      { label: "0%", value: 0 },
      { label: "2%", value: 0.02 },
      { label: "3%", value: 0.03 },
      { label: "6%", value: 0.06 }
    ],
    recommendedRange: { min: 0, max: 0.06 },
    hardRange: { min: 0, max: 0.06 },
    sectionHint: "Fees"
  },
  {
    key: "deal_terms.realtor_commission_payment_mode",
    label: "Commission payment mode",
    unit: "enum",
    control: "readonly",
    readOnly: !0,
    simpleDefinition: "How and when the realtor commission is paid.",
    impact: "Locked to per-payment-event: commission is deducted at each payment event.",
    formula: "realtor_commission_payment_mode = PER_PAYMENT_EVENT (locked in v10.2)",
    options: [
      { label: "Per payment event", value: "PER_PAYMENT_EVENT" }
    ],
    sectionHint: "Fees"
  },
  {
    key: "deal_terms.duration_yield_floor_enabled",
    label: "Duration Yield Floor (enabled)",
    unit: "enum",
    control: "enum",
    simpleDefinition: "Whether the Duration Yield Floor protection is active.",
    impact: "When enabled, it can raise settlement above the ceiling for long-duration deals.",
    formula: "if enabled AND exit_year >= start_year, DYF may override standard ceiling",
    options: [
      { label: "Disabled", value: "false" },
      { label: "Enabled", value: "true" }
    ],
    sectionHint: "Protections"
  },
  {
    key: "deal_terms.duration_yield_floor_start_year",
    label: "DYF start year",
    unit: "years",
    control: "kiosk",
    simpleDefinition: "The year when Duration Yield Floor protection kicks in.",
    impact: "After this year, the DYF minimum return guarantee becomes active.",
    formula: "DYF activates if exit_year >= duration_yield_floor_start_year",
    anchors: [
      { label: "5", value: 5 },
      { label: "7", value: 7 },
      { label: "10", value: 10 },
      { label: "15", value: 15 }
    ],
    recommendedRange: { min: 5, max: 15 },
    hardRange: { min: 1, max: 30 },
    sectionHint: "Protections"
  },
  {
    key: "deal_terms.duration_yield_floor_min_multiple",
    label: "DYF minimum multiple",
    unit: "number",
    control: "kiosk",
    simpleDefinition: "The minimum return multiple guaranteed by the Duration Yield Floor.",
    impact: "If DYF activates, settlement cannot be below invested_capital * this multiple.",
    formula: "dyf_floor_amount = invested_capital_total * duration_yield_floor_min_multiple",
    anchors: [
      { label: "1.50×", value: 1.5 },
      { label: "1.75×", value: 1.75 },
      { label: "2.00×", value: 2 },
      { label: "2.50×", value: 2.5 }
    ],
    recommendedRange: { min: 1.2, max: 3 },
    hardRange: { min: 1, max: 5 },
    sectionHint: "Protections"
  },
  {
    key: "__disclosure__",
    label: "Disclosures & assumptions",
    unit: "info",
    control: "info",
    simpleDefinition: "These numbers are estimates based on the inputs you choose.",
    impact: "Projections depend on home prices, timing, fees, and rules like floors/ceilings—real outcomes can be different.",
    formula: "Model uses: FMV + appreciation assumption + monthly equity purchase + settlement rules (floors/ceilings/fees). Not financial advice; projections aren't guarantees.",
    sectionHint: "Assumptions"
  }
];
function qt(e, t) {
  const n = e.dynamicPercentAnchors;
  return n ? n.percents.map((r) => {
    let l = r * t;
    n.maxPercentOfSource != null && (l = Math.min(l, n.maxPercentOfSource * t));
    const o = Math.round(l / 100) * 100, c = n.min != null ? Math.max(n.min, o) : o;
    return { label: `$${c.toLocaleString("en-US")}`, value: c };
  }) : e.anchors ?? [];
}
const Fe = [
  {
    key: "payments",
    label: "Payments",
    sections: [
      {
        label: "Payment terms",
        fieldKeys: [
          "deal_terms.property_value",
          "deal_terms.upfront_payment",
          "deal_terms.monthly_payment",
          "deal_terms.number_of_payments"
        ]
      }
    ]
  },
  {
    key: "ownership",
    label: "Ownership",
    sections: [
      {
        label: "Hold & maturity",
        fieldKeys: [
          "deal_terms.minimum_hold_years",
          "deal_terms.contract_maturity_years",
          "deal_terms.liquidity_trigger_year"
        ]
      }
    ]
  },
  {
    key: "assumptions",
    label: "Assumptions",
    sections: [
      {
        label: "Market & timing",
        fieldKeys: [
          "scenario.annual_appreciation",
          "scenario.exit_year",
          "scenario.closing_cost_pct"
        ]
      },
      {
        label: "Disclosures",
        fieldKeys: ["__disclosure__"]
      }
    ]
  },
  {
    key: "protections",
    label: "Protections",
    sections: [
      {
        label: "Floor & ceiling",
        fieldKeys: [
          "deal_terms.floor_multiple",
          "deal_terms.ceiling_multiple",
          "deal_terms.downside_mode"
        ]
      },
      {
        label: "Timing window",
        fieldKeys: [
          "deal_terms.payback_window_start_year",
          "deal_terms.payback_window_end_year",
          "deal_terms.timing_factor_early",
          "deal_terms.timing_factor_late"
        ]
      },
      {
        label: "Duration Yield Floor",
        fieldKeys: [
          "deal_terms.duration_yield_floor_enabled",
          "deal_terms.duration_yield_floor_start_year",
          "deal_terms.duration_yield_floor_min_multiple"
        ]
      }
    ]
  },
  {
    key: "fees",
    label: "Fees",
    sections: [
      {
        label: "System fees",
        fieldKeys: [
          "deal_terms.platform_fee",
          "deal_terms.servicing_fee_monthly",
          "deal_terms.exit_fee_pct"
        ]
      },
      {
        label: "Realtor commission",
        fieldKeys: [
          "deal_terms.realtor_representation_mode",
          "deal_terms.realtor_commission_pct",
          "deal_terms.realtor_commission_payment_mode"
        ]
      }
    ]
  }
];
function Vt(e) {
  const t = {}, { deal_terms: n, scenario: r } = e;
  return n.property_value <= 0 && (t["deal_terms.property_value"] = "Property value must be greater than 0"), n.upfront_payment < 0 && (t["deal_terms.upfront_payment"] = "Upfront payment cannot be negative"), n.monthly_payment < 0 && (t["deal_terms.monthly_payment"] = "Monthly payment cannot be negative"), n.number_of_payments < 0 && (t["deal_terms.number_of_payments"] = "Number of payments cannot be negative"), r.exit_year <= 0 && (t["scenario.exit_year"] = "Exit year must be greater than 0"), (r.annual_appreciation < -0.5 || r.annual_appreciation > 0.5) && (t["scenario.annual_appreciation"] = "Annual appreciation must be between -50% and 50%"), n.realtor_commission_pct !== void 0 && (n.realtor_commission_pct < 0 || n.realtor_commission_pct > 0.06) && (t["deal_terms.realtor_commission_pct"] = "Realtor commission must be between 0% and 6%"), n.realtor_representation_mode === "NONE" && n.realtor_commission_pct !== void 0 && n.realtor_commission_pct !== 0 && (t["deal_terms.realtor_commission_pct"] = "Commission must be 0% when representation mode is NONE"), t;
}
function $e(e) {
  return Object.keys(e).length > 0;
}
const Ye = {
  padding: "5px 10px",
  borderRadius: 6,
  border: "1px solid #d1d5db",
  background: "#fff",
  color: "#374151",
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
  fontFamily: "system-ui, sans-serif",
  transition: "all 0.15s"
}, Ht = {
  ...Ye,
  border: "2px solid #111827",
  background: "#111827",
  color: "#fff"
};
function Bt({
  value: e,
  anchors: t,
  unit: n,
  onSelectAnchor: r,
  customValue: l,
  onChangeCustom: o,
  onBlurCustom: c,
  disabled: d,
  error: m
}) {
  const u = t.some((g) => g.value === e), h = n === "currency" || n === "number" || n === "months" || n === "years" ? "numeric" : "decimal", v = n === "currency" ? "$" : "", b = n === "percent" ? "%" : n === "years" ? " yr" : n === "months" ? " mo" : "";
  return /* @__PURE__ */ s("div", { children: [
    /* @__PURE__ */ a("div", { style: { display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6 }, children: t.map((g) => /* @__PURE__ */ a(
      "button",
      {
        type: "button",
        disabled: d,
        onClick: () => r(g.value),
        style: {
          ...g.value === e ? Ht : Ye,
          opacity: d ? 0.5 : 1,
          cursor: d ? "not-allowed" : "pointer"
        },
        children: g.label
      },
      g.label
    )) }),
    /* @__PURE__ */ s("div", { style: { position: "relative" }, children: [
      v && /* @__PURE__ */ a(
        "span",
        {
          style: {
            position: "absolute",
            left: 10,
            top: "50%",
            transform: "translateY(-50%)",
            fontSize: 13,
            color: "#9ca3af",
            pointerEvents: "none"
          },
          children: v
        }
      ),
      /* @__PURE__ */ a(
        "input",
        {
          type: "text",
          inputMode: h,
          disabled: d,
          value: u ? "" : l,
          placeholder: u ? "Custom" : "",
          onChange: (g) => o(g.target.value),
          onBlur: c,
          style: {
            width: "100%",
            padding: v ? "7px 10px 7px 22px" : "7px 10px",
            border: m ? "1px solid #ef4444" : "1px solid #d1d5db",
            borderRadius: 6,
            fontSize: 13,
            fontFamily: "system-ui, sans-serif",
            boxSizing: "border-box",
            background: d ? "#f3f4f6" : "#fff",
            color: d ? "#9ca3af" : "#111827"
          }
        }
      ),
      b && /* @__PURE__ */ a(
        "span",
        {
          style: {
            position: "absolute",
            right: 10,
            top: "50%",
            transform: "translateY(-50%)",
            fontSize: 12,
            color: "#9ca3af",
            pointerEvents: "none"
          },
          children: b
        }
      )
    ] }),
    m && /* @__PURE__ */ a("div", { style: { color: "#ef4444", fontSize: 11, marginTop: 3 }, children: m })
  ] });
}
const Wt = `
@keyframes fpShimmer {
  0% { background-position: -200px 0; }
  100% { background-position: 200px 0; }
}
`, Ut = {
  display: "inline-block",
  width: 60,
  height: 12,
  borderRadius: 4,
  background: "linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%)",
  backgroundSize: "200px 100%",
  animation: "fpShimmer 1.5s infinite"
};
function Gt({ tier1: e, status: t, error: n }) {
  return /* @__PURE__ */ s(
    "div",
    {
      style: {
        background: "#f9fafb",
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        padding: 14
      },
      children: [
        /* @__PURE__ */ a("style", { children: Wt }),
        /* @__PURE__ */ s(
          "div",
          {
            style: {
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 10
            },
            children: [
              /* @__PURE__ */ a("span", { style: { fontWeight: 600, fontSize: 13, color: "#374151" }, children: "Preview" }),
              t === "computing" && /* @__PURE__ */ a("span", { style: Ut })
            ]
          }
        ),
        /* @__PURE__ */ s("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }, children: [
          /* @__PURE__ */ s("div", { children: [
            /* @__PURE__ */ a("div", { style: { fontSize: 11, color: "#9ca3af" }, children: "Upfront cash" }),
            /* @__PURE__ */ s("div", { style: { fontSize: 15, fontWeight: 600, color: "#111827" }, children: [
              "$",
              e.upfrontCash.toLocaleString("en-US")
            ] })
          ] }),
          /* @__PURE__ */ s("div", { children: [
            /* @__PURE__ */ a("div", { style: { fontSize: 11, color: "#9ca3af" }, children: "Installments" }),
            /* @__PURE__ */ a("div", { style: { fontSize: 13, color: "#374151" }, children: e.installmentsLabel })
          ] }),
          /* @__PURE__ */ s("div", { children: [
            /* @__PURE__ */ a("div", { style: { fontSize: 11, color: "#9ca3af" }, children: "Total installments" }),
            /* @__PURE__ */ s("div", { style: { fontSize: 13, color: "#374151" }, children: [
              "$",
              e.totalInstallments.toLocaleString("en-US")
            ] })
          ] }),
          /* @__PURE__ */ s("div", { children: [
            /* @__PURE__ */ a("div", { style: { fontSize: 11, color: "#9ca3af" }, children: "Total cash paid" }),
            /* @__PURE__ */ s("div", { style: { fontSize: 15, fontWeight: 600, color: "#111827" }, children: [
              "$",
              e.totalCashPaid.toLocaleString("en-US")
            ] })
          ] })
        ] }),
        t === "error" && n && /* @__PURE__ */ a(
          "div",
          {
            style: {
              marginTop: 8,
              fontSize: 11,
              color: "#dc2626",
              background: "#fef2f2",
              padding: "6px 8px",
              borderRadius: 6
            },
            children: n
          }
        )
      ]
    }
  );
}
function se({ simpleDefinition: e, impact: t }) {
  const [n, r] = P(!1), l = Se(null), o = Se(null);
  ve(() => {
    if (!n) return;
    function m(u) {
      l.current && !l.current.contains(u.target) && o.current && !o.current.contains(u.target) && r(!1);
    }
    return document.addEventListener("mousedown", m), () => document.removeEventListener("mousedown", m);
  }, [n]);
  const [c, d] = P({ top: 0, left: 0 });
  return ve(() => {
    if (!n || !l.current) return;
    const m = l.current.getBoundingClientRect();
    d({
      top: m.top + window.scrollY - 8,
      left: m.left + m.width / 2 + window.scrollX
    });
  }, [n]), /* @__PURE__ */ s("span", { style: { display: "inline-block", marginLeft: 4 }, children: [
    /* @__PURE__ */ a(
      "button",
      {
        ref: l,
        type: "button",
        onClick: () => r((m) => !m),
        "aria-label": "Help",
        style: {
          width: 16,
          height: 16,
          borderRadius: "50%",
          border: "1px solid #9ca3af",
          background: n ? "#111827" : "#fff",
          color: n ? "#fff" : "#6b7280",
          fontSize: 10,
          fontWeight: 700,
          cursor: "pointer",
          padding: 0,
          lineHeight: "14px",
          textAlign: "center",
          verticalAlign: "middle"
        },
        children: "?"
      }
    ),
    n && We(
      /* @__PURE__ */ s(
        "div",
        {
          ref: o,
          style: {
            position: "absolute",
            top: c.top,
            left: c.left,
            transform: "translate(-50%, -100%)",
            background: "#1f2937",
            color: "#f9fafb",
            borderRadius: 8,
            padding: "10px 12px",
            fontSize: 12,
            lineHeight: 1.5,
            width: 240,
            zIndex: 99999,
            boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
            pointerEvents: "auto"
          },
          children: [
            /* @__PURE__ */ a("div", { style: { fontWeight: 600, marginBottom: 4 }, children: e }),
            /* @__PURE__ */ a("div", { style: { color: "#d1d5db" }, children: t })
          ]
        }
      ),
      document.body
    )
  ] });
}
function Kt(e, t, n) {
  const r = t === "homeowner" ? "receive" : "pay", l = t === "homeowner" ? "payout" : "return";
  switch (e) {
    case "payments": {
      const o = [];
      return n.upfrontPayment != null && o.push(`You ${r} ${R(n.upfrontPayment)} upfront at closing.`), n.monthlyPayment != null && n.numberOfPayments != null && n.numberOfPayments > 0 && o.push(
        `Then ${R(n.monthlyPayment)}/mo for ${n.numberOfPayments} months.`
      ), o.length === 0 && o.push("The upfront amount is set at closing. Monthly installments, if any, follow."), o.push("These amounts go directly toward the equity position."), o;
    }
    case "ownership": {
      const o = [];
      return n.contractMaturityYears != null && o.push(`The contract lasts up to ${n.contractMaturityYears} years.`), n.minimumHoldYears != null && o.push(`Earliest allowed settlement is at year ${n.minimumHoldYears}.`), n.exitYear != null && o.push(`Expected settlement is at year ${n.exitYear}.`), o.length === 0 && o.push("This tab controls how long the deal lasts and when settlement can happen."), o;
    }
    case "protections":
      return [
        `A floor sets the minimum ${l} — the ${l} won't go below this level.`,
        `A ceiling caps the maximum ${l}. Both are adjustable in this tab.`,
        "Duration yield floor, if enabled, adds extra protection for longer hold periods."
      ];
    case "assumptions":
      return [
        "Growth rate and exit year are assumptions, not guarantees.",
        "Changing these values updates the projected results in real time."
      ];
    case "fees": {
      const o = [];
      return n.platformFee != null && o.push(`Platform fee: ${R(n.platformFee)} (one-time at closing).`), n.servicingFeeMonthly != null && o.push(`Monthly servicing: ${R(n.servicingFeeMonthly)}/mo for account management.`), n.exitFeePct != null && o.push(`Exit fee: ${J(n.exitFeePct)} of the settlement amount at exit.`), o.length === 0 && o.push("Fees include a platform fee, monthly servicing, and an exit fee at settlement."), t === "realtor" && o.push("Realtor commission is tracked separately below."), o;
    }
    default:
      return [];
  }
}
function Xt(e, t) {
  if (t === "__disclosure__") return null;
  const [n, r] = t.split(".");
  return e[n][r];
}
function Jt(e, t) {
  return e.dynamicPercentAnchors ? qt(e, t.deal_terms.property_value) : e.anchors ?? [];
}
const Qt = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.5)",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  paddingTop: "5vh",
  zIndex: 9999,
  fontFamily: "system-ui, sans-serif"
}, Zt = {
  background: "#fff",
  borderRadius: 12,
  width: "min(680px, 95vw)",
  height: "min(85vh, 720px)",
  display: "flex",
  flexDirection: "column",
  boxShadow: "0 8px 32px rgba(0,0,0,0.18)"
}, en = {
  display: "flex",
  gap: 0,
  borderBottom: "1px solid #e5e7eb",
  padding: "0 16px",
  overflowX: "auto"
};
function tn({
  draft: e,
  errors: t,
  preview: n,
  persona: r,
  permissions: l,
  setField: o,
  onBlurCompute: c,
  onSave: d,
  onClose: m
}) {
  const [u, h] = P("payments"), [v, b] = P({}), g = q(() => {
    const i = /* @__PURE__ */ new Map();
    for (const _ of jt) i.set(_.key, _);
    return i;
  }, []), y = !$e(t) && r !== "realtor" && l?.canEdit !== !1, O = N(
    (i, _) => {
      if (o(i, _), b((w) => ({ ...w, [i]: "" })), i !== "deal_terms.realtor_representation_mode") {
        if (i === "deal_terms.realtor_commission_pct") {
          c();
          return;
        }
        c();
      }
    },
    [o, c]
  ), k = N(
    (i, _) => {
      if (i === "deal_terms.duration_yield_floor_enabled") {
        o(i, _ === "true"), c();
        return;
      }
      if (o(i, _), i === "deal_terms.realtor_representation_mode") {
        _ === "NONE" && o("deal_terms.realtor_commission_pct", 0), c();
        return;
      }
      c();
    },
    [o, c]
  ), B = N(
    (i, _) => {
      b((w) => ({ ...w, [i]: _ }));
    },
    []
  ), f = N(
    (i, _) => {
      const w = v[i];
      if (w === void 0 || w === "") return;
      let D;
      _.unit === "percent" ? D = parseFloat(w) / 100 : D = parseFloat(w.replace(/,/g, "")), Number.isFinite(D) && (_.hardRange && (D = Math.max(_.hardRange.min, Math.min(_.hardRange.max, D))), o(i, D), c());
    },
    [v, o, c]
  ), A = N(() => {
    y && (d(e), m());
  }, [y, e, d, m]), I = (i) => i === "deal_terms.realtor_commission_pct" ? e.deal_terms.realtor_representation_mode === "NONE" : i === "deal_terms.realtor_commission_payment_mode", z = (i, _) => i == null ? "—" : _.unit === "percent" ? `${(i * 100).toFixed(2)}%` : _.unit === "currency" ? `$${i.toLocaleString("en-US")}` : _.unit === "years" ? `${i} yr` : _.unit === "months" ? `${i} mo` : typeof i == "boolean" ? i ? "Yes" : "No" : String(i), T = (i) => {
    const _ = i.key, w = Xt(e, _), D = t[_], j = i.readOnly || I(_), W = ee(_, r, i.label);
    if (i.control === "info")
      return /* @__PURE__ */ s(
        "div",
        {
          style: {
            padding: "10px 12px",
            background: "#fffbeb",
            border: "1px solid #fde68a",
            borderRadius: 8,
            fontSize: 12,
            lineHeight: 1.6,
            color: "#92400e"
          },
          children: [
            /* @__PURE__ */ a("div", { style: { fontWeight: 600, marginBottom: 4 }, children: i.simpleDefinition }),
            /* @__PURE__ */ a("div", { children: i.impact })
          ]
        },
        _
      );
    if (i.control === "enum") {
      const F = i.options ?? [], $ = _ === "deal_terms.duration_yield_floor_enabled" ? String(w) : w;
      return /* @__PURE__ */ s("div", { style: { marginBottom: 14 }, children: [
        /* @__PURE__ */ s("label", { style: ce, children: [
          W,
          /* @__PURE__ */ a(se, { simpleDefinition: i.simpleDefinition, impact: i.impact })
        ] }),
        /* @__PURE__ */ a(
          "select",
          {
            value: $,
            disabled: j,
            onChange: (M) => k(_, M.target.value),
            style: {
              ...nn,
              background: j ? "#f3f4f6" : "#fff",
              color: j ? "#9ca3af" : "#111827"
            },
            children: F.map((M) => /* @__PURE__ */ a("option", { value: M.value, children: M.label }, M.value))
          }
        ),
        D && /* @__PURE__ */ a("div", { style: Me, children: D })
      ] }, _);
    }
    if (i.control === "readonly")
      return /* @__PURE__ */ s("div", { style: { marginBottom: 14 }, children: [
        /* @__PURE__ */ s("label", { style: ce, children: [
          W,
          /* @__PURE__ */ a(se, { simpleDefinition: i.simpleDefinition, impact: i.impact })
        ] }),
        /* @__PURE__ */ a("div", { style: an, children: z(w, i) })
      ] }, _);
    if (i.control === "slider" && i.slider)
      return /* @__PURE__ */ s("div", { style: { marginBottom: 14 }, children: [
        /* @__PURE__ */ s("label", { style: ce, children: [
          W,
          /* @__PURE__ */ a(se, { simpleDefinition: i.simpleDefinition, impact: i.impact })
        ] }),
        /* @__PURE__ */ s("div", { style: { display: "flex", alignItems: "center", gap: 10 }, children: [
          /* @__PURE__ */ a(
            "input",
            {
              type: "range",
              min: i.slider.min,
              max: i.slider.max,
              step: i.slider.step,
              value: w,
              disabled: j,
              onChange: (F) => o(_, parseFloat(F.target.value)),
              onMouseUp: c,
              onTouchEnd: c,
              style: { flex: 1 }
            }
          ),
          /* @__PURE__ */ a("span", { style: { fontSize: 13, fontWeight: 600, minWidth: 80, textAlign: "right" }, children: z(w, i) })
        ] }),
        D && /* @__PURE__ */ a("div", { style: Me, children: D })
      ] }, _);
    if (i.control === "kiosk") {
      const F = Jt(i, e), $ = F.length >= 4 ? [F[0], F[1], F[2], F[3]] : [
        F[0] ?? { label: "—", value: 0 },
        F[1] ?? { label: "—", value: 0 },
        F[2] ?? { label: "—", value: 0 },
        F[3] ?? { label: "—", value: 0 }
      ];
      let M = v[_] ?? "";
      return !M && !$.some((Z) => Z.value === w) && (i.unit === "percent" ? M = (w * 100).toString() : M = String(w)), /* @__PURE__ */ s("div", { style: { marginBottom: 14 }, children: [
        /* @__PURE__ */ s("label", { style: ce, children: [
          W,
          /* @__PURE__ */ a(se, { simpleDefinition: i.simpleDefinition, impact: i.impact })
        ] }),
        /* @__PURE__ */ a(
          Bt,
          {
            value: w,
            anchors: $,
            unit: i.unit,
            onSelectAnchor: (Z) => O(_, Z),
            customValue: M,
            onChangeCustom: (Z) => B(_, Z),
            onBlurCustom: () => f(_, i),
            disabled: j,
            error: D
          }
        )
      ] }, _);
    }
    return null;
  }, ie = Fe.find((i) => i.key === u);
  return /* @__PURE__ */ a("div", { style: Qt, onClick: (i) => {
    i.target === i.currentTarget && m();
  }, children: /* @__PURE__ */ s("div", { style: Zt, role: "dialog", "aria-modal": "true", "data-testid": "deal-edit-modal", children: [
    /* @__PURE__ */ a("div", { style: { padding: "16px 20px 0", borderBottom: "none" }, children: /* @__PURE__ */ s("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" }, children: [
      /* @__PURE__ */ a("h2", { style: { margin: 0, fontSize: 18, color: "#111827" }, children: "Edit Deal Terms" }),
      /* @__PURE__ */ a(
        "button",
        {
          type: "button",
          onClick: m,
          "aria-label": "Close",
          style: {
            background: "none",
            border: "none",
            fontSize: 20,
            cursor: "pointer",
            color: "#6b7280",
            padding: "4px 8px"
          },
          children: "×"
        }
      )
    ] }) }),
    /* @__PURE__ */ a("div", { style: en, children: Fe.map((i) => /* @__PURE__ */ a(
      "button",
      {
        type: "button",
        onClick: () => h(i.key),
        style: {
          padding: "10px 16px",
          border: "none",
          borderBottom: u === i.key ? "2px solid #111827" : "2px solid transparent",
          background: "none",
          fontSize: 13,
          fontWeight: u === i.key ? 600 : 400,
          color: u === i.key ? "#111827" : "#6b7280",
          cursor: "pointer",
          fontFamily: "system-ui, sans-serif",
          whiteSpace: "nowrap"
        },
        children: i.label
      },
      i.key
    )) }),
    /* @__PURE__ */ a("div", { style: { flex: 1, overflow: "auto", padding: "16px 20px" }, children: /* @__PURE__ */ s("div", { style: { display: "grid", gridTemplateColumns: "1fr 220px", gap: 20 }, children: [
      /* @__PURE__ */ a("div", { children: ie.sections.map((i) => /* @__PURE__ */ s("div", { style: { marginBottom: 20 }, children: [
        /* @__PURE__ */ a(
          "h4",
          {
            style: {
              margin: "0 0 10px 0",
              fontSize: 12,
              color: "#9ca3af",
              textTransform: "uppercase",
              letterSpacing: 0.5
            },
            children: i.label
          }
        ),
        i.fieldKeys.map((_) => {
          const w = g.get(_);
          return w ? T(w) : null;
        })
      ] }, i.label)) }),
      /* @__PURE__ */ s("div", { children: [
        /* @__PURE__ */ a(
          Gt,
          {
            tier1: n.tier1,
            status: n.status,
            error: n.error
          }
        ),
        /* @__PURE__ */ s(
          "div",
          {
            style: {
              marginTop: 12,
              padding: "10px 12px",
              background: "#f9fafb",
              borderRadius: 8,
              border: "1px solid #e5e7eb"
            },
            "data-testid": "tab-explainer",
            children: [
              /* @__PURE__ */ a("div", { style: { fontSize: 11, fontWeight: 600, color: "#6b7280", marginBottom: 6 }, children: "What this means" }),
              /* @__PURE__ */ a("ul", { style: { margin: 0, padding: "0 0 0 14px", fontSize: 11, lineHeight: 1.6, color: "#374151" }, children: Kt(u, r, {
                upfrontPayment: e.deal_terms.upfront_payment,
                monthlyPayment: e.deal_terms.monthly_payment,
                numberOfPayments: e.deal_terms.number_of_payments,
                contractMaturityYears: e.deal_terms.contract_maturity_years,
                minimumHoldYears: e.deal_terms.minimum_hold_years,
                exitYear: e.scenario.exit_year,
                platformFee: e.deal_terms.platform_fee,
                servicingFeeMonthly: e.deal_terms.servicing_fee_monthly,
                exitFeePct: e.deal_terms.exit_fee_pct
              }).map((i, _) => /* @__PURE__ */ a("li", { style: { marginBottom: 2 }, children: i }, _)) })
            ]
          }
        )
      ] })
    ] }) }),
    /* @__PURE__ */ s(
      "div",
      {
        style: {
          padding: "12px 20px",
          borderTop: "1px solid #e5e7eb",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        },
        children: [
          /* @__PURE__ */ a(
            "button",
            {
              type: "button",
              onClick: m,
              style: {
                padding: "8px 20px",
                borderRadius: 8,
                border: "1px solid #d1d5db",
                background: "#fff",
                color: "#374151",
                fontSize: 13,
                cursor: "pointer",
                fontFamily: "system-ui, sans-serif"
              },
              children: "Cancel"
            }
          ),
          /* @__PURE__ */ a(
            "button",
            {
              type: "button",
              onClick: A,
              disabled: !y,
              style: {
                padding: "8px 24px",
                borderRadius: 8,
                border: "none",
                background: y ? "#111827" : "#d1d5db",
                color: y ? "#fff" : "#9ca3af",
                fontSize: 13,
                fontWeight: 600,
                cursor: y ? "pointer" : "not-allowed",
                fontFamily: "system-ui, sans-serif"
              },
              children: "Save"
            }
          )
        ]
      }
    )
  ] }) });
}
const ce = {
  display: "block",
  fontSize: 12,
  color: "#374151",
  marginBottom: 5,
  fontWeight: 500
}, nn = {
  width: "100%",
  padding: "7px 10px",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  fontSize: 13,
  fontFamily: "system-ui, sans-serif",
  boxSizing: "border-box"
}, an = {
  padding: "7px 10px",
  background: "#f3f4f6",
  border: "1px solid #e5e7eb",
  borderRadius: 6,
  fontSize: 13,
  color: "#6b7280"
}, Me = {
  color: "#ef4444",
  fontSize: 11,
  marginTop: 3
};
function Ee() {
  return {
    deal_terms: {
      property_value: 6e5,
      upfront_payment: 5e4,
      monthly_payment: 0,
      number_of_payments: 0,
      payback_window_start_year: 5,
      payback_window_end_year: 10,
      timing_factor_early: 0.8,
      timing_factor_late: 1,
      floor_multiple: 1,
      ceiling_multiple: 3.25,
      downside_mode: "HARD_FLOOR",
      contract_maturity_years: 30,
      liquidity_trigger_year: 15,
      minimum_hold_years: 3,
      platform_fee: L.platform_fee,
      servicing_fee_monthly: L.servicing_fee_monthly,
      exit_fee_pct: L.exit_fee_pct,
      realtor_representation_mode: "NONE",
      realtor_commission_pct: 0,
      realtor_commission_payment_mode: "PER_PAYMENT_EVENT"
    },
    scenario: {
      annual_appreciation: 0.03,
      closing_cost_pct: 0.02,
      exit_year: 7
    }
  };
}
function me(e) {
  const { upfront_payment: t, monthly_payment: n, number_of_payments: r } = e.deal_terms, { exit_year: l } = e.scenario, o = Math.floor(l * 12), c = Math.min(r, o), d = n * c, m = t + d, u = c === 0 ? "No installments" : `${c} payments of $${n.toLocaleString("en-US")}`;
  return {
    upfrontCash: t,
    installmentsLabel: u,
    totalInstallments: d,
    totalCashPaid: m
  };
}
function rn(e) {
  return ue(e.deal_terms, e.scenario);
}
function on(e, t, n) {
  const r = structuredClone(e), [l, o] = t.split(".");
  return r[l][o] = n, r;
}
function ln(e) {
  const [t, n] = P(
    () => e ?? Ee()
  ), [r, l] = P({}), [o, c] = P(() => ({
    tier1: me(e ?? Ee()),
    status: "idle"
  })), d = N((h, v) => {
    n((b) => {
      const g = on(b, h, v);
      return c((y) => ({ ...y, tier1: me(g) })), g;
    });
  }, []), m = N(() => {
    n((h) => {
      const v = Vt(h);
      if (l(v), $e(v))
        return c((b) => ({
          ...b,
          status: "error",
          error: "Validation failed"
        })), h;
      c((b) => ({ ...b, status: "computing" }));
      try {
        const b = rn(h);
        c({
          tier1: me(h),
          status: "ok",
          lastComputedAtIso: (/* @__PURE__ */ new Date()).toISOString(),
          results: b
        });
      } catch (b) {
        c((g) => ({
          ...g,
          status: "error",
          error: b instanceof Error ? b.message : "Compute failed"
        }));
      }
      return h;
    });
  }, []), u = q(() => me(t), [t]);
  return {
    draft: t,
    errors: r,
    preview: { ...o, tier1: u },
    setField: d,
    onBlurCompute: m
  };
}
function sn(e) {
  return {
    property_value: e.propertyValue,
    upfront_payment: e.upfrontPayment,
    monthly_payment: e.monthlyPayment,
    number_of_payments: e.numberOfPayments,
    payback_window_start_year: Math.max(0, Math.floor(e.exitYear / 3)),
    payback_window_end_year: Math.max(1, Math.ceil(e.exitYear * 2 / 3)),
    timing_factor_early: 1,
    timing_factor_late: 1,
    floor_multiple: 1.1,
    ceiling_multiple: 2,
    downside_mode: "HARD_FLOOR",
    contract_maturity_years: 30,
    liquidity_trigger_year: 13,
    minimum_hold_years: 2,
    platform_fee: L.platform_fee,
    servicing_fee_monthly: L.servicing_fee_monthly,
    exit_fee_pct: L.exit_fee_pct,
    duration_yield_floor_enabled: !1,
    duration_yield_floor_start_year: null,
    duration_yield_floor_min_multiple: null,
    realtor_representation_mode: e.realtorMode,
    realtor_commission_pct: e.realtorPct / 100,
    realtor_commission_payment_mode: "PER_PAYMENT_EVENT"
  };
}
function cn(e) {
  return {
    annual_appreciation: e.growthRatePct / 100,
    closing_cost_pct: 0,
    exit_year: e.exitYear
  };
}
const Dn = [
  "buyer",
  "homeowner",
  "realtor"
];
function mn(e) {
  const { draft: t, errors: n, preview: r, setField: l, onBlurCompute: o } = ln(
    e.initial
  );
  return /* @__PURE__ */ a(
    tn,
    {
      draft: t,
      errors: n,
      preview: r,
      persona: e.persona,
      setField: l,
      onBlurCompute: o,
      onSave: (c) => e.onSaved(c),
      onClose: e.onClose
    }
  );
}
const G = {
  display: "block",
  fontSize: 12,
  color: "#6b7280",
  marginBottom: 4,
  fontWeight: 500
}, K = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  fontSize: 14,
  fontFamily: "system-ui, sans-serif",
  boxSizing: "border-box"
}, X = {
  marginBottom: 14
}, be = {
  padding: 12,
  background: "#f9fafb",
  borderRadius: 8,
  border: "1px solid #e5e7eb"
}, ge = {
  padding: "10px 20px",
  borderRadius: 8,
  border: "none",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "system-ui, sans-serif"
}, Ae = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "4px 10px",
  background: "#f3f4f6",
  borderRadius: 16,
  fontSize: 12,
  color: "#374151",
  border: "1px solid #e5e7eb",
  whiteSpace: "nowrap"
}, Te = {
  color: "#6b7280",
  fontWeight: 400
}, De = {
  fontWeight: 600
};
function Le() {
  if (typeof window > "u") return !1;
  try {
    return new URLSearchParams(window.location.search).get("DEV_HARNESS") === "true" || !1;
  } catch {
    return !1;
  }
}
function dn() {
  if (!Le() || typeof window > "u") return null;
  try {
    const e = new URLSearchParams(window.location.search).get("devAuth");
    if (e === "editor" || e === "viewer" || e === "loggedOut")
      return e;
    const t = void 0;
  } catch {
  }
  return null;
}
function Ce(e, t) {
  if (typeof e == "string") return e;
  switch (t) {
    case "currency":
      return R(e);
    case "percent":
      return J(e);
    case "multiple":
      return `${e.toFixed(2)}×`;
    case "months":
      return `${e}`;
    default:
      return String(e);
  }
}
function un(e) {
  const {
    persona: t,
    mode: n = "marketing",
    canEdit: r,
    onEvent: l,
    onDraftSnapshot: o,
    onShareSummary: c,
    onSave: d
  } = e, m = n === "app", u = n === "marketing", h = dn(), v = h === "editor" ? !0 : h === "viewer" || h === "loggedOut" ? !1 : r ?? !1, [b, g] = P(!1), [y, O] = P(6e5), [k, B] = P(1e5), [f, A] = P(0), [I, z] = P(0), [T, ie] = P(10), [i, _] = P(3), [w, D] = P("NONE"), [j, W] = P(0);
  ve(() => {
    l?.({ type: "calculator_used", persona: t });
  }, [t, l]);
  const F = q(
    () => ({
      propertyValue: y,
      upfrontPayment: k,
      monthlyPayment: f,
      numberOfPayments: I,
      exitYear: T,
      growthRatePct: i,
      realtorMode: w,
      realtorPct: j
    }),
    [
      y,
      k,
      f,
      I,
      T,
      i,
      w,
      j
    ]
  ), $ = q(
    () => sn(F),
    [F]
  ), M = q(
    () => cn(F),
    [F]
  ), Z = q(
    () => ({ deal_terms: $, scenario: M }),
    [$, M]
  ), C = q(
    () => ue($, M),
    [$, M]
  ), U = q(
    () => zt(
      t,
      $,
      M,
      C
    ),
    [t, $, M, C]
  ), re = T * 12, V = q(
    () => m ? St({
      homeValue: y,
      initialBuyAmount: k,
      termYears: T,
      annualGrowthRate: i / 100
    }) : null,
    [m, y, k, T, i]
  ), we = q(
    () => V ? kt(V) : null,
    [V]
  ), pe = (p, x) => {
    const oe = Number(p.replace(/,/g, ""));
    return Number.isFinite(oe) && oe >= 0 ? oe : x;
  }, je = N(() => {
    if (l?.({ type: "save_clicked", persona: t }), d && V) {
      const p = Ot(V.normalizedInputs);
      d(p);
    }
  }, [V, d, l, t]), qe = N(async () => {
    if (l?.({ type: "save_continue_clicked", persona: t }), o) {
      const p = {
        homeValue: y,
        initialBuyAmount: k,
        termYears: T,
        annualGrowthRate: i / 100
      }, x = {
        standard_net_payout: C.isa_settlement,
        early_net_payout: C.isa_settlement,
        late_net_payout: C.isa_settlement,
        standard_settlement_month: re,
        early_settlement_month: re,
        late_settlement_month: re
      }, [oe, Be] = await Promise.all([
        ae(p),
        ae(x)
      ]);
      o({
        contract_version: te,
        schema_version: ne,
        persona: t,
        mode: "marketing",
        inputs: p,
        basic_results: x,
        input_hash: oe,
        output_hash: Be,
        created_at: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
  }, [
    t,
    y,
    k,
    T,
    i,
    C,
    re,
    o,
    l
  ]), Ve = N(() => {
    l?.({ type: "share_clicked", persona: t }), c && c({
      contract_version: te,
      schema_version: ne,
      persona: t,
      inputs: {
        homeValue: y,
        initialBuyAmount: k,
        termYears: T,
        annualGrowthRate: i / 100
      },
      basic_results: {
        standard_net_payout: C.isa_settlement,
        early_net_payout: C.isa_settlement,
        late_net_payout: C.isa_settlement
      },
      created_at: (/* @__PURE__ */ new Date()).toISOString()
    });
  }, [
    t,
    y,
    k,
    T,
    i,
    C,
    c,
    l
  ]), He = q(() => {
    const p = [
      { label: "Property", value: R(y) },
      { label: "Upfront", value: R(k) },
      { label: "Monthly", value: R(f) },
      { label: "# Months", value: String(I) },
      { label: "Exit Year", value: String(T) },
      { label: "Growth", value: J(i / 100) }
    ];
    return w !== "NONE" && p.push({ label: "Realtor", value: `${w} ${j}%` }), p;
  }, [
    y,
    k,
    f,
    I,
    T,
    i,
    w,
    j
  ]);
  return /* @__PURE__ */ s(
    "div",
    {
      style: {
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        padding: 16,
        fontFamily: "system-ui, sans-serif",
        maxWidth: 900
      },
      "data-fractpath-widget": !0,
      "data-persona": t,
      "data-mode": n,
      children: [
        /* @__PURE__ */ a("h2", { style: { margin: 0, marginBottom: 4, fontSize: 20 }, children: "FractPath Calculator" }),
        /* @__PURE__ */ a(
          "div",
          {
            style: {
              fontSize: 11,
              color: "#9ca3af",
              marginBottom: 12,
              fontStyle: "italic"
            },
            children: u ? "Basic Results — upgrade for full analysis" : "Full Analysis"
          }
        ),
        m && /* @__PURE__ */ s("div", { style: { marginBottom: 16 }, children: [
          /* @__PURE__ */ a(
            "div",
            {
              style: {
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
                alignItems: "center"
              },
              "data-testid": "deal-term-chips",
              children: He.map((p, x) => /* @__PURE__ */ s("span", { style: Ae, children: [
                /* @__PURE__ */ s("span", { style: Te, children: [
                  p.label,
                  ":"
                ] }),
                /* @__PURE__ */ a("span", { style: De, children: p.value })
              ] }, x))
            }
          ),
          v && /* @__PURE__ */ a(
            "button",
            {
              type: "button",
              onClick: () => g(!0),
              style: {
                marginTop: 8,
                padding: "6px 14px",
                borderRadius: 6,
                border: "1px solid #d1d5db",
                background: "#fff",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
                fontFamily: "system-ui, sans-serif",
                color: "#374151"
              },
              "data-testid": "edit-button",
              children: "Edit"
            }
          )
        ] }),
        /* @__PURE__ */ s(
          "div",
          {
            style: {
              display: "grid",
              gridTemplateColumns: m ? "1fr" : "minmax(220px, 1fr) minmax(320px, 2fr)",
              gap: 20
            },
            children: [
              u && /* @__PURE__ */ s("div", { children: [
                /* @__PURE__ */ a(
                  "h3",
                  {
                    style: { margin: "0 0 12px 0", fontSize: 14, color: "#374151" },
                    children: "Inputs"
                  }
                ),
                /* @__PURE__ */ s("div", { style: X, children: [
                  /* @__PURE__ */ a("label", { style: G, children: ee(
                    "deal_terms.property_value",
                    t,
                    "Home Value ($)"
                  ) }),
                  /* @__PURE__ */ a(
                    "input",
                    {
                      type: "text",
                      inputMode: "numeric",
                      style: K,
                      value: y.toLocaleString(),
                      onChange: (p) => {
                        O(pe(p.target.value, y));
                      }
                    }
                  )
                ] }),
                /* @__PURE__ */ s("div", { style: X, children: [
                  /* @__PURE__ */ a("label", { style: G, children: ee(
                    "deal_terms.upfront_payment",
                    t,
                    "Upfront Payment ($)"
                  ) }),
                  /* @__PURE__ */ a(
                    "input",
                    {
                      type: "text",
                      inputMode: "numeric",
                      style: K,
                      value: k.toLocaleString(),
                      onChange: (p) => {
                        B(
                          pe(p.target.value, k)
                        );
                      }
                    }
                  )
                ] }),
                /* @__PURE__ */ s("div", { style: X, children: [
                  /* @__PURE__ */ a("label", { style: G, children: ee(
                    "deal_terms.monthly_payment",
                    t,
                    "Monthly Installment ($)"
                  ) }),
                  /* @__PURE__ */ a(
                    "input",
                    {
                      type: "text",
                      inputMode: "numeric",
                      style: K,
                      value: f.toLocaleString(),
                      onChange: (p) => {
                        A(
                          pe(p.target.value, f)
                        );
                      }
                    }
                  )
                ] }),
                /* @__PURE__ */ s("div", { style: X, children: [
                  /* @__PURE__ */ a("label", { style: G, children: "Number of Monthly Payments" }),
                  /* @__PURE__ */ a(
                    "input",
                    {
                      type: "number",
                      min: 0,
                      max: 360,
                      step: 1,
                      style: K,
                      value: I,
                      onChange: (p) => {
                        const x = parseInt(p.target.value, 10);
                        Number.isFinite(x) && x >= 0 && x <= 360 && z(x);
                      }
                    }
                  )
                ] }),
                /* @__PURE__ */ s("div", { style: X, children: [
                  /* @__PURE__ */ a("label", { style: G, children: ee("scenario.exit_year", t, "Target Exit Year") }),
                  /* @__PURE__ */ a(
                    "input",
                    {
                      type: "number",
                      min: 1,
                      max: 30,
                      step: 1,
                      style: K,
                      value: T,
                      onChange: (p) => {
                        const x = parseInt(p.target.value, 10);
                        Number.isFinite(x) && x >= 1 && x <= 30 && ie(x);
                      }
                    }
                  )
                ] }),
                /* @__PURE__ */ s("div", { style: X, children: [
                  /* @__PURE__ */ a("label", { style: G, children: "Annual Growth Rate (assumption)" }),
                  /* @__PURE__ */ a(
                    "input",
                    {
                      type: "number",
                      min: 0,
                      max: 20,
                      step: 0.1,
                      style: K,
                      value: i,
                      onChange: (p) => {
                        const x = parseFloat(p.target.value);
                        Number.isFinite(x) && x >= 0 && x <= 20 && _(x);
                      }
                    }
                  )
                ] }),
                /* @__PURE__ */ s("div", { style: X, children: [
                  /* @__PURE__ */ a("label", { style: G, children: ee(
                    "deal_terms.realtor_representation_mode",
                    t,
                    "Realtor Representation"
                  ) }),
                  /* @__PURE__ */ s(
                    "select",
                    {
                      value: w,
                      onChange: (p) => {
                        D(p.target.value), p.target.value === "NONE" && W(0);
                      },
                      style: {
                        ...K,
                        padding: "7px 10px"
                      },
                      children: [
                        /* @__PURE__ */ a("option", { value: "NONE", children: "None" }),
                        /* @__PURE__ */ a("option", { value: "BUYER", children: "Buyer" }),
                        /* @__PURE__ */ a("option", { value: "SELLER", children: "Seller" }),
                        /* @__PURE__ */ a("option", { value: "DUAL", children: "Dual" })
                      ]
                    }
                  )
                ] }),
                w !== "NONE" && /* @__PURE__ */ s("div", { style: X, children: [
                  /* @__PURE__ */ a("label", { style: G, children: ee(
                    "deal_terms.realtor_commission_pct",
                    t,
                    "Commission (%)"
                  ) }),
                  /* @__PURE__ */ a(
                    "input",
                    {
                      type: "number",
                      min: 0,
                      max: 6,
                      step: 0.5,
                      style: K,
                      value: j,
                      onChange: (p) => {
                        const x = parseFloat(p.target.value);
                        Number.isFinite(x) && x >= 0 && x <= 6 && W(x);
                      }
                    }
                  )
                ] }),
                u && /* @__PURE__ */ s("div", { style: { marginTop: 12 }, children: [
                  /* @__PURE__ */ a(
                    "h4",
                    {
                      style: {
                        margin: "0 0 8px 0",
                        fontSize: 12,
                        color: "#9ca3af",
                        textTransform: "uppercase",
                        letterSpacing: 0.5
                      },
                      children: "Fees"
                    }
                  ),
                  /* @__PURE__ */ s(
                    "div",
                    {
                      style: { display: "flex", flexDirection: "column", gap: 6 },
                      children: [
                        /* @__PURE__ */ s(
                          "div",
                          {
                            style: {
                              padding: "6px 10px",
                              background: "#f3f4f6",
                              borderRadius: 6,
                              fontSize: 13,
                              color: "#6b7280",
                              border: "1px solid #e5e7eb"
                            },
                            children: [
                              "Platform fee: ",
                              R(L.platform_fee)
                            ]
                          }
                        ),
                        /* @__PURE__ */ s(
                          "div",
                          {
                            style: {
                              padding: "6px 10px",
                              background: "#f3f4f6",
                              borderRadius: 6,
                              fontSize: 13,
                              color: "#6b7280",
                              border: "1px solid #e5e7eb"
                            },
                            children: [
                              "Monthly servicing:",
                              " ",
                              R(L.servicing_fee_monthly)
                            ]
                          }
                        ),
                        /* @__PURE__ */ s(
                          "div",
                          {
                            style: {
                              padding: "6px 10px",
                              background: "#f3f4f6",
                              borderRadius: 6,
                              fontSize: 13,
                              color: "#6b7280",
                              border: "1px solid #e5e7eb"
                            },
                            children: [
                              "Exit fee: ",
                              J(L.exit_fee_pct)
                            ]
                          }
                        )
                      ]
                    }
                  )
                ] })
              ] }),
              /* @__PURE__ */ s("div", { children: [
                /* @__PURE__ */ s(
                  "div",
                  {
                    style: {
                      ...be,
                      marginBottom: 16,
                      textAlign: "center"
                    },
                    "data-testid": "hero-metric",
                    children: [
                      /* @__PURE__ */ a("div", { style: { fontSize: 12, color: "#6b7280", marginBottom: 4 }, children: U.hero.label }),
                      /* @__PURE__ */ a("div", { style: { fontSize: 28, fontWeight: 700, color: "#111827" }, children: Ce(
                        U.hero.value,
                        U.hero.valueFormat
                      ) }),
                      U.hero.subtitle && /* @__PURE__ */ a("div", { style: { fontSize: 11, color: "#9ca3af", marginTop: 4 }, children: U.hero.subtitle })
                    ]
                  }
                ),
                /* @__PURE__ */ a(
                  "div",
                  {
                    style: {
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 6,
                      marginBottom: 16
                    },
                    "data-testid": "summary-strip",
                    children: U.strip.map((p, x) => /* @__PURE__ */ s("span", { style: Ae, children: [
                      /* @__PURE__ */ s("span", { style: Te, children: [
                        p.label,
                        ":"
                      ] }),
                      /* @__PURE__ */ a("span", { style: De, children: Ce(p.value, p.valueFormat) })
                    ] }, x))
                  }
                ),
                u && /* @__PURE__ */ s(
                  "div",
                  {
                    style: {
                      padding: "10px 12px",
                      background: "#fffbeb",
                      border: "1px solid #fde68a",
                      borderRadius: 8,
                      fontSize: 12,
                      lineHeight: 1.6,
                      color: "#92400e",
                      marginBottom: 16
                    },
                    children: [
                      /* @__PURE__ */ s("div", { children: [
                        "Projections assume ",
                        J(i / 100),
                        " annual appreciation."
                      ] }),
                      /* @__PURE__ */ a("div", { style: { marginTop: 4 }, children: "Register free to model different growth scenarios, protections (floor/cap), and early/late settlement timing." })
                    ]
                  }
                ),
                u && /* @__PURE__ */ a("div", { style: { marginBottom: 16 }, children: /* @__PURE__ */ a(
                  Lt,
                  {
                    bars: U.chartSpec.bars,
                    width: 480,
                    height: 200
                  }
                ) }),
                u && /* @__PURE__ */ a(
                  "div",
                  {
                    style: { ...be, marginBottom: 16, padding: "10px 12px" },
                    children: /* @__PURE__ */ s("div", { style: { fontSize: 11, color: "#9ca3af", marginBottom: 4 }, children: [
                      /* @__PURE__ */ a("strong", { children: "Standard" }),
                      " · ",
                      ke(re),
                      " · Net Payout: ",
                      R(C.isa_settlement)
                    ] })
                  }
                ),
                !u && V && /* @__PURE__ */ s(_e, { children: [
                  /* @__PURE__ */ a(
                    "h3",
                    {
                      style: { margin: "0 0 8px 0", fontSize: 14, color: "#374151" },
                      children: "Settlement Scenarios"
                    }
                  ),
                  /* @__PURE__ */ a(
                    "div",
                    {
                      style: {
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                        marginBottom: 16
                      },
                      children: [
                        { label: "Early", data: V.settlements.early },
                        {
                          label: "Standard",
                          data: V.settlements.standard
                        },
                        { label: "Late", data: V.settlements.late }
                      ].map((p) => /* @__PURE__ */ s(
                        "div",
                        {
                          style: {
                            ...be,
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr 1fr",
                            gap: 8,
                            alignItems: "center",
                            padding: "10px 12px"
                          },
                          children: [
                            /* @__PURE__ */ s("div", { children: [
                              /* @__PURE__ */ a("div", { style: { fontSize: 11, color: "#9ca3af" }, children: "Timing" }),
                              /* @__PURE__ */ a("div", { style: { fontWeight: 600, fontSize: 13 }, children: p.label })
                            ] }),
                            /* @__PURE__ */ s("div", { children: [
                              /* @__PURE__ */ a("div", { style: { fontSize: 11, color: "#9ca3af" }, children: "When" }),
                              /* @__PURE__ */ a("div", { style: { fontSize: 13 }, children: ke(p.data.settlementMonth) })
                            ] }),
                            /* @__PURE__ */ s("div", { children: [
                              /* @__PURE__ */ a("div", { style: { fontSize: 11, color: "#9ca3af" }, children: "Net Payout" }),
                              /* @__PURE__ */ a("div", { style: { fontWeight: 600, fontSize: 13 }, children: R(p.data.netPayout) })
                            ] }),
                            /* @__PURE__ */ s("div", { children: [
                              /* @__PURE__ */ a("div", { style: { fontSize: 11, color: "#9ca3af" }, children: "Raw Payout" }),
                              /* @__PURE__ */ a("div", { style: { fontSize: 13 }, children: R(p.data.rawPayout) })
                            ] }),
                            /* @__PURE__ */ s("div", { children: [
                              /* @__PURE__ */ a("div", { style: { fontSize: 11, color: "#9ca3af" }, children: "Transfer Fee" }),
                              /* @__PURE__ */ s("div", { style: { fontSize: 13 }, children: [
                                R(p.data.transferFeeAmount),
                                " (",
                                J(p.data.transferFeeRate),
                                ")"
                              ] })
                            ] }),
                            /* @__PURE__ */ s("div", { children: [
                              /* @__PURE__ */ a("div", { style: { fontSize: 11, color: "#9ca3af" }, children: "Clamp" }),
                              /* @__PURE__ */ a("div", { style: { fontSize: 13 }, children: p.data.clamp.applied === "none" ? "—" : p.data.clamp.applied === "floor" ? "Floor" : "Cap" })
                            ] })
                          ]
                        },
                        p.label
                      ))
                    }
                  )
                ] }),
                !u && we && /* @__PURE__ */ a(Et, { series: we, width: 520, height: 240 }),
                u && /* @__PURE__ */ a(
                  "ul",
                  {
                    style: {
                      margin: "0 0 12px 0",
                      padding: "0 0 0 18px",
                      fontSize: 12,
                      lineHeight: 1.7,
                      color: "#374151"
                    },
                    "data-testid": "marketing-bullets",
                    children: U.marketingBullets.map((p, x) => /* @__PURE__ */ a("li", { style: { marginBottom: 2 }, children: p }, x))
                  }
                ),
                /* @__PURE__ */ s(
                  "div",
                  {
                    style: {
                      display: "flex",
                      gap: 10,
                      marginTop: 16,
                      flexWrap: "wrap"
                    },
                    children: [
                      u && /* @__PURE__ */ s(_e, { children: [
                        /* @__PURE__ */ a(
                          "button",
                          {
                            type: "button",
                            onClick: qe,
                            style: {
                              ...ge,
                              background: "#111827",
                              color: "#fff"
                            },
                            "data-cta": "save-continue",
                            children: "Save & Continue"
                          }
                        ),
                        /* @__PURE__ */ a(
                          "button",
                          {
                            type: "button",
                            onClick: Ve,
                            style: {
                              ...ge,
                              background: "#fff",
                              color: "#111827",
                              border: "1px solid #d1d5db"
                            },
                            "data-cta": "share",
                            children: "Share"
                          }
                        )
                      ] }),
                      !u && /* @__PURE__ */ a(
                        "button",
                        {
                          type: "button",
                          onClick: je,
                          style: {
                            ...ge,
                            background: "#111827",
                            color: "#fff"
                          },
                          "data-cta": "save",
                          children: "Save"
                        }
                      )
                    ]
                  }
                )
              ] })
            ]
          }
        ),
        u && Le() && /* @__PURE__ */ s("details", { style: { marginTop: 12, fontSize: 11, color: "#6b7280" }, children: [
          /* @__PURE__ */ a("summary", { style: { cursor: "pointer" }, children: "Canonical deal_terms (debug)" }),
          /* @__PURE__ */ a(
            "pre",
            {
              style: {
                whiteSpace: "pre-wrap",
                background: "#f9fafb",
                padding: 8,
                borderRadius: 6,
                marginTop: 4
              },
              children: JSON.stringify(
                {
                  deal_terms: $,
                  assumptions: M,
                  result: {
                    isa_settlement: C.isa_settlement,
                    invested_capital_total: C.invested_capital_total,
                    vested_equity_percentage: C.vested_equity_percentage
                  }
                },
                null,
                2
              )
            }
          )
        ] }),
        b && v && /* @__PURE__ */ a(
          mn,
          {
            initial: Z,
            persona: t,
            onClose: () => g(!1),
            onSaved: (p) => {
              O(p.deal_terms.property_value), B(p.deal_terms.upfront_payment), A(p.deal_terms.monthly_payment), z(p.deal_terms.number_of_payments), ie(p.scenario.exit_year), _(p.scenario.annual_appreciation * 100), D(p.deal_terms.realtor_representation_mode), W(p.deal_terms.realtor_commission_pct * 100), g(!1);
            }
          }
        ),
        /* @__PURE__ */ s(
          "div",
          {
            style: {
              marginTop: 12,
              color: "#9ca3af",
              fontSize: 11,
              textAlign: "center"
            },
            children: [
              "Viewing as ",
              /* @__PURE__ */ a("strong", { children: t }),
              " · ",
              "Mode: ",
              /* @__PURE__ */ a("strong", { children: n }),
              h && /* @__PURE__ */ s(_e, { children: [
                " ",
                "· DEV_AUTH: ",
                /* @__PURE__ */ a("strong", { children: h })
              ] }),
              " · ",
              R(y),
              " home · ",
              R(k),
              " ",
              "upfront · ",
              R(f),
              "×",
              I,
              "mo ·",
              " ",
              T,
              "yr · ",
              J(i / 100),
              " growth"
            ]
          }
        )
      ]
    }
  );
}
function Cn(e) {
  return /* @__PURE__ */ a(un, { ...e });
}
function pn({ items: e }) {
  return /* @__PURE__ */ a(
    "div",
    {
      style: {
        display: "flex",
        gap: 1,
        background: "#e5e7eb",
        borderRadius: 8,
        overflow: "hidden"
      },
      children: e.map((t, n) => /* @__PURE__ */ s(
        "div",
        {
          style: {
            flex: 1,
            background: "#fff",
            padding: "12px 14px",
            minWidth: 0,
            textAlign: "center"
          },
          children: [
            /* @__PURE__ */ a("div", { style: { fontSize: 11, color: "#9ca3af", marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }, children: t.label }),
            /* @__PURE__ */ a("div", { style: { fontSize: 18, fontWeight: 700, color: "#111827", whiteSpace: "nowrap" }, children: t.value }),
            t.sublabel && /* @__PURE__ */ a("div", { style: { fontSize: 10, color: "#6b7280", marginTop: 2 }, children: t.sublabel })
          ]
        },
        n
      ))
    }
  );
}
function _n({ results: e }) {
  return /* @__PURE__ */ s(
    "div",
    {
      style: {
        border: "1px dashed #d1d5db",
        borderRadius: 8,
        padding: "32px 20px",
        textAlign: "center",
        background: "#f9fafb",
        minHeight: 180,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8
      },
      children: [
        /* @__PURE__ */ s("svg", { width: "48", height: "48", viewBox: "0 0 48 48", fill: "none", children: [
          /* @__PURE__ */ a("rect", { x: "4", y: "28", width: "8", height: "16", rx: "2", fill: "#d1d5db" }),
          /* @__PURE__ */ a("rect", { x: "16", y: "18", width: "8", height: "26", rx: "2", fill: "#9ca3af" }),
          /* @__PURE__ */ a("rect", { x: "28", y: "10", width: "8", height: "34", rx: "2", fill: "#6b7280" }),
          /* @__PURE__ */ a("rect", { x: "40", y: "4", width: "4", height: "40", rx: "2", fill: "#374151" })
        ] }),
        /* @__PURE__ */ a("div", { style: { fontSize: 13, fontWeight: 600, color: "#374151" }, children: "Equity Transfer Chart" }),
        /* @__PURE__ */ s("div", { style: { fontSize: 11, color: "#9ca3af", maxWidth: 320, lineHeight: 1.5 }, children: [
          "Will render when schedule series is exposed in canonical compute outputs. Currently, compute v",
          e.compute_version,
          " returns summary results only."
        ] })
      ]
    }
  );
}
const fn = [
  { key: "cash_flow", label: "Cash Flow" },
  { key: "ownership", label: "Ownership" },
  { key: "protections", label: "Protections" },
  { key: "fees", label: "Fees" },
  { key: "assumptions", label: "Assumptions" }
];
function S(e) {
  return "$" + e.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function H(e) {
  return (e * 100).toFixed(2) + "%";
}
function Q(e) {
  return e.toFixed(2) + "×";
}
function yn({ rows: e }) {
  return /* @__PURE__ */ a("dl", { style: { margin: 0 }, children: e.map((t, n) => /* @__PURE__ */ s(
    "div",
    {
      style: {
        display: "flex",
        justifyContent: "space-between",
        padding: "7px 0",
        borderBottom: n < e.length - 1 ? "1px solid #f3f4f6" : "none"
      },
      children: [
        /* @__PURE__ */ a("dt", { style: { fontSize: 13, color: "#6b7280" }, children: t.label }),
        /* @__PURE__ */ a("dd", { style: { fontSize: 13, fontWeight: 500, color: "#111827", margin: 0 }, children: t.value })
      ]
    },
    n
  )) });
}
function hn(e, t) {
  const n = [
    {
      label: "Settlement",
      value: S(e.isa_settlement),
      sublabel: e.dyf_applied ? "DYF applied" : void 0
    },
    {
      label: "Investor Profit",
      value: S(e.investor_profit)
    },
    {
      label: "Return Multiple",
      value: Q(e.investor_multiple)
    },
    {
      label: "Annual IRR",
      value: H(e.investor_irr_annual)
    },
    {
      label: "Projected FMV",
      value: S(e.projected_fmv),
      sublabel: `${H(t.scenario.annual_appreciation)} / yr`
    }
  ], r = t.deal_terms.realtor_representation_mode, l = t.deal_terms.realtor_commission_pct;
  return r !== "NONE" ? n.push({
    label: "Realtor Fee (est.)",
    value: S(e.realtor_fee_total_projected),
    sublabel: `${H(l)} · ${r}`
  }) : n.push({
    label: "Realtor Fee",
    value: "$0",
    sublabel: "No realtor"
  }), n;
}
function bn(e) {
  return [
    { label: "Invested capital (total)", value: S(e.invested_capital_total) },
    { label: "ISA settlement", value: S(e.isa_settlement) },
    { label: "Investor profit", value: S(e.investor_profit) },
    { label: "Return multiple", value: Q(e.investor_multiple) },
    { label: "Annual IRR", value: H(e.investor_irr_annual) },
    { label: "Annual IRR (net)", value: e.investor_irr_annual_net != null ? H(e.investor_irr_annual_net) : "Not computed" },
    { label: "Timing factor applied", value: Q(e.timing_factor_applied) }
  ];
}
function gn(e, t) {
  return [
    { label: "Vested equity", value: H(t.vested_equity_percentage) },
    { label: "Base equity value", value: S(t.base_equity_value) },
    { label: "Minimum hold", value: `${e.deal_terms.minimum_hold_years} yr` },
    { label: "Contract maturity", value: `${e.deal_terms.contract_maturity_years} yr` },
    { label: "Liquidity trigger", value: `${e.deal_terms.liquidity_trigger_year} yr` }
  ];
}
function vn(e, t) {
  const n = [
    { label: "Floor multiple", value: Q(e.deal_terms.floor_multiple) },
    { label: "Floor amount", value: S(t.floor_amount) },
    { label: "Ceiling multiple", value: Q(e.deal_terms.ceiling_multiple) },
    { label: "Ceiling amount", value: S(t.ceiling_amount) },
    { label: "Downside mode", value: e.deal_terms.downside_mode === "HARD_FLOOR" ? "Hard floor" : "No floor" },
    { label: "Pre-floor/cap value", value: S(t.isa_pre_floor_cap) },
    { label: "Gain above capital", value: S(t.gain_above_capital) }
  ];
  return e.deal_terms.duration_yield_floor_enabled ? n.push(
    { label: "DYF enabled", value: "Yes" },
    { label: "DYF start year", value: `${e.deal_terms.duration_yield_floor_start_year ?? "—"} yr` },
    { label: "DYF min multiple", value: e.deal_terms.duration_yield_floor_min_multiple != null ? Q(e.deal_terms.duration_yield_floor_min_multiple) : "—" },
    { label: "DYF floor amount", value: t.dyf_floor_amount != null ? S(t.dyf_floor_amount) : "—" },
    { label: "DYF applied", value: t.dyf_applied ? "Yes" : "No" }
  ) : n.push({ label: "DYF enabled", value: "No" }), n;
}
function xn(e, t) {
  const n = [
    { label: "Platform fee", value: S(e.deal_terms.platform_fee) },
    { label: "Servicing fee (monthly)", value: S(e.deal_terms.servicing_fee_monthly) },
    { label: "Exit fee", value: H(e.deal_terms.exit_fee_pct) }
  ], r = e.deal_terms.realtor_representation_mode;
  return n.push({ label: "Realtor representation", value: r === "NONE" ? "None" : r }), n.push({ label: "Realtor commission", value: H(e.deal_terms.realtor_commission_pct) }), n.push({ label: "Commission payment mode", value: e.deal_terms.realtor_commission_payment_mode }), n.push({ label: "Realtor fee (upfront)", value: S(t.realtor_fee_upfront_projected) }), n.push({ label: "Realtor fee (installments)", value: S(t.realtor_fee_installments_projected) }), n.push({ label: "Buyer attribution", value: S(t.buyer_realtor_fee_total_projected) }), n.push({ label: "Seller attribution", value: S(t.seller_realtor_fee_total_projected) }), n;
}
function wn(e) {
  const t = [
    { label: "Annual appreciation", value: H(e.scenario.annual_appreciation) },
    { label: "Exit year", value: `${e.scenario.exit_year} yr` },
    { label: "Closing costs", value: H(e.scenario.closing_cost_pct) },
    { label: "Property value", value: S(e.deal_terms.property_value) },
    { label: "Upfront payment", value: S(e.deal_terms.upfront_payment) },
    { label: "Monthly payment", value: S(e.deal_terms.monthly_payment) },
    { label: "Number of payments", value: `${e.deal_terms.number_of_payments}` },
    { label: "Payback window", value: `${e.deal_terms.payback_window_start_year}–${e.deal_terms.payback_window_end_year} yr` },
    { label: "Timing factor (early)", value: Q(e.deal_terms.timing_factor_early) },
    { label: "Timing factor (late)", value: Q(e.deal_terms.timing_factor_late) }
  ];
  return e.scenario.fmv_override != null && t.push({ label: "FMV override", value: S(e.scenario.fmv_override) }), t;
}
function Sn(e, t, n) {
  switch (e) {
    case "cash_flow":
      return bn(n);
    case "ownership":
      return gn(t, n);
    case "protections":
      return vn(t, n);
    case "fees":
      return xn(t, n);
    case "assumptions":
      return wn(t);
  }
}
function Nn({
  persona: e,
  status: t,
  inputs: n,
  results: r
}) {
  const [l, o] = P("cash_flow"), c = hn(r, n), d = Sn(l, n, r);
  return /* @__PURE__ */ s(
    "div",
    {
      style: {
        border: "1px solid #e5e7eb",
        borderRadius: 10,
        fontFamily: "system-ui, sans-serif",
        overflow: "hidden"
      },
      "data-testid": "deal-snapshot-view",
      "data-persona": e,
      children: [
        /* @__PURE__ */ s(
          "div",
          {
            style: {
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "14px 18px",
              borderBottom: "1px solid #e5e7eb",
              background: "#fafafa"
            },
            children: [
              /* @__PURE__ */ a("h2", { style: { margin: 0, fontSize: 17, color: "#111827" }, children: "Deal Snapshot" }),
              /* @__PURE__ */ s("div", { style: { display: "flex", gap: 8, alignItems: "center" }, children: [
                t && /* @__PURE__ */ a(
                  "span",
                  {
                    style: {
                      fontSize: 11,
                      fontWeight: 600,
                      padding: "3px 10px",
                      borderRadius: 10,
                      background: "#e0e7ff",
                      color: "#3730a3"
                    },
                    children: t
                  }
                ),
                e && /* @__PURE__ */ a(
                  "span",
                  {
                    style: {
                      fontSize: 11,
                      padding: "3px 10px",
                      borderRadius: 10,
                      background: "#f3f4f6",
                      color: "#6b7280"
                    },
                    children: e
                  }
                )
              ] })
            ]
          }
        ),
        /* @__PURE__ */ a("div", { style: { padding: "14px 18px" }, children: /* @__PURE__ */ a(pn, { items: c }) }),
        /* @__PURE__ */ a("div", { style: { padding: "0 18px 14px" }, children: /* @__PURE__ */ a(_n, { results: r }) }),
        /* @__PURE__ */ s("div", { style: { borderTop: "1px solid #e5e7eb" }, children: [
          /* @__PURE__ */ a(
            "div",
            {
              style: {
                display: "flex",
                gap: 0,
                borderBottom: "1px solid #e5e7eb",
                padding: "0 18px",
                overflowX: "auto"
              },
              children: fn.map((m) => /* @__PURE__ */ a(
                "button",
                {
                  type: "button",
                  onClick: () => o(m.key),
                  style: {
                    padding: "9px 14px",
                    border: "none",
                    borderBottom: l === m.key ? "2px solid #111827" : "2px solid transparent",
                    background: "none",
                    fontSize: 12,
                    fontWeight: l === m.key ? 600 : 400,
                    color: l === m.key ? "#111827" : "#6b7280",
                    cursor: "pointer",
                    fontFamily: "system-ui, sans-serif",
                    whiteSpace: "nowrap"
                  },
                  children: m.label
                },
                m.key
              ))
            }
          ),
          /* @__PURE__ */ a("div", { style: { padding: "14px 18px" }, children: /* @__PURE__ */ a(yn, { rows: d }) })
        ] }),
        /* @__PURE__ */ s(
          "div",
          {
            style: {
              padding: "8px 18px",
              borderTop: "1px solid #f3f4f6",
              background: "#fafafa",
              fontSize: 10,
              color: "#9ca3af",
              textAlign: "center"
            },
            children: [
              "Compute v",
              r.compute_version,
              " · Read-only snapshot"
            ]
          }
        )
      ]
    }
  );
}
function On({ value: e, anchors: t, onCommit: n, parseRaw: r }) {
  const [l, o] = P(""), [c, d] = P(!1), m = t.some((y) => y.value === e), u = N(
    (y) => {
      d(!1), o(""), n(y);
    },
    [n]
  ), h = N(() => {
    d(!0);
  }, []), v = N((y) => {
    o(y);
  }, []), b = N(() => {
    if (!l) {
      d(!1);
      return;
    }
    const O = (r ?? ((k) => parseFloat(k.replace(/,/g, ""))))(l);
    Number.isFinite(O) && n(O), d(!1);
  }, [l, n, r]), g = c ? l : m ? "" : String(e);
  return {
    isAnchorMatch: m && !c,
    displayCustom: g,
    selectAnchor: u,
    focusCustom: h,
    changeCustom: v,
    blurCustom: b
  };
}
export {
  te as CONTRACT_VERSION,
  tn as DealEditModal,
  pn as DealKpiStrip,
  Nn as DealSnapshotView,
  Et as EquityChart,
  _n as EquityTransferChart,
  L as FEE_DEFAULTS,
  Cn as FractPathCalculatorWidget,
  Dn as MARKETING_PERSONAS,
  ne as SCHEMA_VERSION,
  kt as buildChartSeries,
  En as buildDraftSnapshot,
  Ot as buildFullDealSnapshotV1,
  Tn as buildSavePayload,
  An as buildShareSummary,
  St as computeScenario,
  ae as deterministicHash,
  ee as getLabel,
  Fn as getPersonaConfig,
  Mn as getSummaryOrder,
  bt as normalizeInputs,
  zt as resolvePersonaPresentation,
  On as useKioskInput
};
