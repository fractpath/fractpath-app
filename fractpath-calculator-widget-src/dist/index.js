import { jsx as i, jsxs as u, Fragment as $ } from "react/jsx-runtime";
import { useState as E, useEffect as ot, useMemo as j, useCallback as V } from "react";
const it = 0.03, lt = 0.035, st = 0.045, ct = 0.025, ut = 1.1, dt = 2, mt = 0.01, yt = 0.03, ft = 0.1, ht = 25e-4, P = {
  homeValue: 6e5,
  initialBuyAmount: 1e5,
  termYears: 10,
  annualGrowthRate: it,
  transferFeeRate_standard: lt,
  transferFeeRate_early: st,
  transferFeeRate_late: ct,
  floorMultiple: ut,
  capMultiple: dt,
  vesting: {
    upfrontEquityPct: ft,
    monthlyEquityPct: ht,
    months: 120
  },
  cpw: {
    startPct: mt,
    endPct: yt
  }
};
function g(t) {
  return Math.round((t + Number.EPSILON) * 100) / 100;
}
function Q(t) {
  return Math.round((t + Number.EPSILON) * 1e6) / 1e6;
}
function pt(t) {
  return Math.round((t + Number.EPSILON) * 1e4) / 1e4;
}
const X = 1e3, B = 1e-10;
function k(t, e) {
  let n = 0;
  for (let a = 0; a < e.length; a++)
    n += e[a] / Math.pow(1 + t, a);
  return n;
}
function _t(t, e) {
  let n = 0;
  for (let a = 1; a < e.length; a++)
    n += -a * e[a] / Math.pow(1 + t, a + 1);
  return n;
}
function gt(t) {
  if (t.length < 2)
    return null;
  let e = 0.01;
  for (let n = 0; n < X; n++) {
    const a = k(e, t), o = _t(e, t);
    if (Math.abs(o) < 1e-20)
      return q(t);
    const r = e - a / o;
    if (r <= -1)
      return q(t);
    if (Math.abs(r - e) < B)
      return Q(r);
    e = r;
  }
  return q(t);
}
function q(t) {
  let e = -0.999, n = 10;
  const a = k(e, t), o = k(n, t);
  if (a * o > 0)
    return null;
  for (let r = 0; r < X; r++) {
    const d = (e + n) / 2, m = k(d, t);
    if (Math.abs(m) < B || (n - e) / 2 < B)
      return Q(d);
    m * k(e, t) < 0 ? n = d : e = d;
  }
  return null;
}
function vt(t) {
  const e = Math.pow(1 + t, 12) - 1;
  return pt(e);
}
function St(t) {
  const e = gt(t);
  return e === null ? 0 : vt(e);
}
const bt = "10.0.0";
function xt(t, e) {
  const n = Math.floor(e.exit_year * 12), a = Math.min(t.number_of_payments, n), o = g(t.upfront_payment + Mt(t.monthly_payment, a)), r = g(Pt(t, e)), d = At(t, e.annual_appreciation, a), m = g(r * d), y = g(m - o), v = Tt(t, e.exit_year), f = g(o + y * v), h = g(o * t.floor_multiple), S = g(o * t.ceiling_multiple), _ = g(Rt(t.downside_mode, f, h, S)), { isa_settlement: b, dyf_floor_amount: x, dyf_applied: R } = Ft(t, e.exit_year, o, _), M = g(b - o), l = g(o > 0 ? b / o : 0), s = wt(t, a, n, b), F = St(s);
  return {
    invested_capital_total: o,
    vested_equity_percentage: d,
    projected_fmv: r,
    base_equity_value: m,
    gain_above_capital: y,
    isa_pre_floor_cap: f,
    floor_amount: h,
    ceiling_amount: S,
    isa_settlement: b,
    dyf_floor_amount: x,
    dyf_applied: R,
    investor_profit: M,
    investor_multiple: l,
    investor_irr_annual: F,
    compute_version: bt
  };
}
function Mt(t, e) {
  return t * e;
}
function Pt(t, e) {
  return e.fmv_override !== void 0 && e.fmv_override !== null && e.fmv_override > 0 ? e.fmv_override : t.property_value * Math.pow(1 + e.annual_appreciation, e.exit_year);
}
function At(t, e, n) {
  const a = t.upfront_payment / t.property_value;
  let o = 0;
  for (let r = 1; r <= n; r++) {
    const d = t.property_value * Math.pow(1 + e, r / 12);
    o += t.monthly_payment / d;
  }
  return a + o;
}
function Tt(t, e) {
  return e < t.payback_window_start_year ? t.timing_factor_early : e > t.payback_window_end_year ? t.timing_factor_late : 1;
}
function Rt(t, e, n, a) {
  return Math.min(Math.max(e, n), a);
}
function Ft(t, e, n, a) {
  return { isa_settlement: a, dyf_floor_amount: 0, dyf_applied: !1 };
}
function wt(t, e, n, a) {
  const o = new Array(n + 1).fill(0);
  o[0] = -t.upfront_payment;
  for (let r = 1; r <= e; r++)
    o[r] = -t.monthly_payment;
  return o[n] += a, o;
}
const Et = (t, e, n) => Math.min(n, Math.max(e, t));
function kt(t) {
  const e = {
    ...P,
    ...t,
    vesting: {
      ...P.vesting,
      ...t.vesting ?? {}
    },
    cpw: {
      ...P.cpw,
      ...t.cpw ?? {}
    }
  }, n = Math.max(0, Math.round(e.termYears * 12));
  return e.vesting.months = n, e;
}
function Lt(t, e, n) {
  const a = n / 12;
  return t * Math.pow(1 + e, a);
}
function Ct(t, e, n) {
  return Et(t + e * n, 0, 1);
}
function zt(t, e) {
  const n = [];
  for (let a = 0; a <= e; a++) {
    const o = Lt(t.homeValue, t.annualGrowthRate, a), r = Ct(
      t.vesting.upfrontEquityPct,
      t.vesting.monthlyEquityPct,
      a
    );
    n.push({
      month: a,
      year: a / 12,
      homeValue: o,
      equityPct: r
    });
  }
  return n;
}
function D(t, e) {
  const n = t.vesting.months;
  return e === "standard" ? n : e === "early" ? Math.min(36, n) : e === "late" ? n + 24 : n;
}
function Dt(t) {
  return Math.max(0, Math.round(t.termYears * 12)), {
    property_value: t.homeValue,
    upfront_payment: t.initialBuyAmount,
    monthly_payment: t.vesting.monthlyEquityPct * t.homeValue,
    number_of_payments: t.vesting.months,
    // Payback window + timing factors:
    // The legacy widget had TF as a transfer fee rate; canonical compute uses timing factor multipliers.
    // Until UI collects these, we default to neutral (1) and place window across the term.
    payback_window_start_year: Math.max(0, Math.floor(t.termYears / 3)),
    payback_window_end_year: Math.max(1, Math.ceil(t.termYears * 2 / 3)),
    timing_factor_early: 1,
    timing_factor_late: 1,
    floor_multiple: t.floorMultiple,
    ceiling_multiple: t.capMultiple,
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
    duration_yield_floor_min_multiple: null
  };
}
function O(t, e) {
  const n = D(t, e), a = n / 12, o = Dt(t), r = xt(o, {
    annual_appreciation: t.annualGrowthRate,
    exit_year: a
  }), d = r.isa_settlement === r.isa_pre_floor_cap ? "none" : r.isa_settlement === r.floor_amount ? "floor" : r.isa_settlement === r.ceiling_amount ? "cap" : "none", m = 0, y = 0, v = r.isa_settlement;
  return {
    timing: e,
    settlementMonth: n,
    homeValueAtSettlement: r.projected_fmv,
    equityPctAtSettlement: r.vested_equity_percentage,
    rawPayout: r.isa_pre_floor_cap,
    clampedPayout: r.isa_settlement,
    transferFeeAmount: y,
    netPayout: v,
    clamp: { floor: r.floor_amount, cap: r.ceiling_amount, applied: d },
    transferFeeRate: m
  };
}
function It(t = {}) {
  const e = kt(t), n = Math.max(
    D(e, "standard"),
    D(e, "early"),
    D(e, "late")
  ), a = zt(e, n), o = O(e, "standard"), r = O(e, "early"), d = O(e, "late");
  return {
    normalizedInputs: e,
    series: a,
    settlements: { standard: o, early: r, late: d }
  };
}
function Nt(t) {
  const e = t.series.map((a) => ({
    month: a.month,
    year: a.year,
    homeValue: a.homeValue,
    equityPct: a.equityPct
  })), n = ["early", "standard", "late"].map((a) => {
    const o = t.settlements[a];
    return {
      timing: a,
      month: o.settlementMonth,
      year: o.settlementMonth / 12,
      homeValueAtSettlement: o.homeValueAtSettlement,
      equityPctAtSettlement: o.equityPctAtSettlement,
      netPayout: o.netPayout
    };
  });
  return { points: e, markers: n };
}
function Vt(t, e, n) {
  return Math.min(n, Math.max(e, t));
}
function qt(t) {
  return `${Math.round(t * 100)}%`;
}
function Ot(t) {
  return `${Math.round(t * 10) / 10}y`;
}
function Ut(t) {
  return t.timing === "early" ? "Early" : t.timing === "late" ? "Late" : "Std";
}
function Bt({ series: t, width: e = 640, height: n = 240 }) {
  const { points: a, markers: o } = t;
  if (!a.length)
    return /* @__PURE__ */ i("div", { style: { fontFamily: "system-ui, sans-serif" }, children: "No data" });
  const r = { top: 16, right: 16, bottom: 28, left: 44 }, d = Math.max(10, e - r.left - r.right), m = Math.max(10, n - r.top - r.bottom), y = a[0].month, v = a[a.length - 1].month, f = 0, h = 1, S = (l) => v === y ? r.left : r.left + (l - y) / (v - y) * d, _ = (l) => {
    const s = Vt(l, f, h);
    return r.top + (1 - (s - f) / (h - f)) * m;
  }, b = a.map((l, s) => {
    const F = S(l.month), w = _(l.equityPct);
    return `${s === 0 ? "M" : "L"} ${F.toFixed(2)} ${w.toFixed(2)}`;
  }).join(" "), x = [0, 0.5, 1].map((l) => ({
    v: l,
    y: _(l),
    label: qt(l)
  })), R = Math.round((y + v) / 2), M = [y, R, v].map((l) => ({
    m: l,
    x: S(l),
    label: Ot(l / 12)
  }));
  return /* @__PURE__ */ u(
    "svg",
    {
      width: e,
      height: n,
      role: "img",
      "aria-label": "Equity over time",
      style: { display: "block" },
      children: [
        /* @__PURE__ */ i("rect", { x: 0, y: 0, width: e, height: n, fill: "white" }),
        x.map((l) => /* @__PURE__ */ u("g", { children: [
          /* @__PURE__ */ i(
            "line",
            {
              x1: r.left,
              x2: e - r.right,
              y1: l.y,
              y2: l.y,
              stroke: "#e5e7eb",
              strokeWidth: 1
            }
          ),
          /* @__PURE__ */ i(
            "text",
            {
              x: r.left - 8,
              y: l.y + 4,
              fontSize: 12,
              textAnchor: "end",
              fill: "#6b7280",
              fontFamily: "system-ui, sans-serif",
              children: l.label
            }
          )
        ] }, l.v)),
        /* @__PURE__ */ i(
          "line",
          {
            x1: r.left,
            x2: e - r.right,
            y1: r.top + m,
            y2: r.top + m,
            stroke: "#e5e7eb",
            strokeWidth: 1
          }
        ),
        M.map((l) => /* @__PURE__ */ u("g", { children: [
          /* @__PURE__ */ i(
            "line",
            {
              x1: l.x,
              x2: l.x,
              y1: r.top + m,
              y2: r.top + m + 6,
              stroke: "#9ca3af",
              strokeWidth: 1
            }
          ),
          /* @__PURE__ */ i(
            "text",
            {
              x: l.x,
              y: r.top + m + 20,
              fontSize: 12,
              textAnchor: "middle",
              fill: "#6b7280",
              fontFamily: "system-ui, sans-serif",
              children: l.label
            }
          )
        ] }, l.m)),
        o.map((l) => {
          const s = S(l.month);
          return /* @__PURE__ */ u("g", { children: [
            /* @__PURE__ */ i(
              "line",
              {
                x1: s,
                x2: s,
                y1: r.top,
                y2: r.top + m,
                stroke: "#d1d5db",
                strokeWidth: 1,
                strokeDasharray: "4 4"
              }
            ),
            /* @__PURE__ */ i(
              "rect",
              {
                x: s - 16,
                y: r.top - 2,
                width: 32,
                height: 16,
                rx: 6,
                fill: "#f3f4f6",
                stroke: "#e5e7eb"
              }
            ),
            /* @__PURE__ */ i(
              "text",
              {
                x: s,
                y: r.top + 10,
                fontSize: 11,
                textAnchor: "middle",
                fill: "#374151",
                fontFamily: "system-ui, sans-serif",
                children: Ut(l)
              }
            )
          ] }, l.timing);
        }),
        /* @__PURE__ */ i("path", { d: b, fill: "none", stroke: "#111827", strokeWidth: 2 }),
        /* @__PURE__ */ i(
          "text",
          {
            x: r.left,
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
function T(t) {
  return t.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  });
}
function G(t) {
  return `${(t * 100).toFixed(1)}%`;
}
function Wt(t) {
  const e = Math.floor(t / 12), n = t % 12;
  return e === 0 ? `${n}mo` : n === 0 ? `${e}yr` : `${e}yr ${n}mo`;
}
const H = {
  homeowner: {
    heroLabel: "Your Net Payout",
    heroValue: (t) => t.settlements.standard.netPayout,
    helperText: "Estimated net payout at standard settlement timing."
  },
  buyer: {
    heroLabel: "Projected Net Return",
    heroValue: (t) => t.settlements.standard.netPayout,
    helperText: "Projected net return at standard settlement timing."
  },
  investor: {
    heroLabel: "Projected Net Return",
    heroValue: (t) => t.settlements.standard.netPayout,
    helperText: "Projected net return at standard settlement timing."
  },
  realtor: {
    heroLabel: "Standard Net Payout",
    heroValue: (t) => t.settlements.standard.netPayout,
    helperText: "Standard net payout for commission reference."
  },
  ops: {
    heroLabel: "Standard Net Payout",
    heroValue: (t) => t.settlements.standard.netPayout,
    helperText: "Standard net payout at projected settlement."
  }
};
function Yt(t) {
  return H[t] ?? H.homeowner;
}
const W = "1.0.0", Zt = "1.0.0";
function K(t) {
  const e = {};
  for (const n of Object.keys(t).sort()) {
    const a = t[n];
    a !== null && typeof a == "object" && !Array.isArray(a) ? e[n] = K(a) : e[n] = a;
  }
  return JSON.stringify(e);
}
async function I(t) {
  const e = K(t), n = new TextEncoder().encode(e), a = await crypto.subtle.digest("SHA-256", n);
  return Array.from(new Uint8Array(a)).map((r) => r.toString(16).padStart(2, "0")).join("");
}
function Z(t) {
  return {
    homeValue: t.homeValue,
    initialBuyAmount: t.initialBuyAmount,
    termYears: t.termYears,
    annualGrowthRate: t.annualGrowthRate
  };
}
function $t(t) {
  return {
    standard_net_payout: t.settlements.standard.netPayout,
    early_net_payout: t.settlements.early.netPayout,
    late_net_payout: t.settlements.late.netPayout,
    standard_settlement_month: t.settlements.standard.settlementMonth,
    early_settlement_month: t.settlements.early.settlementMonth,
    late_settlement_month: t.settlements.late.settlementMonth
  };
}
function jt(t) {
  return {
    standard_net_payout: t.settlements.standard.netPayout,
    early_net_payout: t.settlements.early.netPayout,
    late_net_payout: t.settlements.late.netPayout
  };
}
async function Gt(t, e, n) {
  const a = Z(e), o = $t(n), [r, d] = await Promise.all([
    I(a),
    I(o)
  ]);
  return {
    contract_version: W,
    schema_version: "v1",
    // ✅ fixed
    persona: t,
    mode: "marketing",
    inputs: a,
    basic_results: o,
    input_hash: r,
    output_hash: d,
    created_at: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function Ht(t, e, n) {
  return {
    contract_version: W,
    schema_version: "v1",
    // ✅ fixed
    persona: t,
    inputs: Z(e),
    basic_results: jt(n),
    created_at: (/* @__PURE__ */ new Date()).toISOString()
  };
}
async function Jt(t, e, n) {
  const [a, o] = await Promise.all([
    I(e),
    I({
      standard: n.settlements.standard,
      early: n.settlements.early,
      late: n.settlements.late
    })
  ]);
  return {
    contract_version: W,
    schema_version: "v1",
    // ✅ fixed
    persona: t,
    mode: "app",
    inputs: e,
    outputs: n,
    input_hash: a,
    output_hash: o,
    created_at: (/* @__PURE__ */ new Date()).toISOString()
  };
}
const L = {
  display: "block",
  fontSize: 12,
  color: "#6b7280",
  marginBottom: 4,
  fontWeight: 500
}, C = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  fontSize: 14,
  fontFamily: "system-ui, sans-serif",
  boxSizing: "border-box"
}, z = {
  marginBottom: 14
}, J = {
  padding: 12,
  background: "#f9fafb",
  borderRadius: 8,
  border: "1px solid #e5e7eb"
}, U = {
  padding: "10px 20px",
  borderRadius: 8,
  border: "none",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "system-ui, sans-serif"
};
function Qt(t) {
  const {
    persona: e,
    mode: n = "marketing",
    initialSnapshot: a,
    onEvent: o,
    onDraftSnapshot: r,
    onShareSummary: d,
    onSave: m
  } = t, y = n === "app", [v, f] = E(!1), [h, S] = E(P.homeValue), [_, b] = E(
    P.initialBuyAmount
  ), [x, R] = E(P.termYears), [M, l] = E(
    P.annualGrowthRate * 100
  );
  ot(() => {
    o?.({ type: "calculator_used", persona: e });
  }, [e, o]);
  const s = j(
    () => It({
      homeValue: h,
      initialBuyAmount: _,
      termYears: x,
      annualGrowthRate: M / 100
    }),
    [h, _, x, M]
  ), F = j(() => Nt(s), [s]), w = Yt(e), tt = w.heroValue(s), A = n === "marketing", et = [
    { label: "Early", data: s.settlements.early },
    { label: "Standard", data: s.settlements.standard },
    { label: "Late", data: s.settlements.late }
  ], Y = (c, p) => {
    const N = Number(c.replace(/,/g, ""));
    return Number.isFinite(N) && N >= 0 ? N : p;
  }, nt = V(async () => {
    if (o?.({ type: "save_continue_clicked", persona: e }), r) {
      const c = await Gt(
        e,
        s.normalizedInputs,
        s
      );
      r(c);
    }
  }, [e, s, r, o]), at = V(() => {
    if (o?.({ type: "share_clicked", persona: e }), d) {
      const c = Ht(
        e,
        s.normalizedInputs,
        s
      );
      d(c);
    }
  }, [e, s, d, o]), rt = V(async () => {
    if (o?.({ type: "save_clicked", persona: e }), m) {
      const c = await Jt(
        e,
        s.normalizedInputs,
        s
      );
      m(c);
    }
  }, [e, s, m, o]);
  return /* @__PURE__ */ u(
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
      "data-persona": e,
      "data-mode": n,
      children: [
        /* @__PURE__ */ i("h2", { style: { margin: 0, marginBottom: 4, fontSize: 20 }, children: "FractPath Calculator" }),
        /* @__PURE__ */ i(
          "div",
          {
            style: {
              fontSize: 11,
              color: "#9ca3af",
              marginBottom: 12,
              fontStyle: "italic"
            },
            children: A ? "Basic Results — upgrade for full analysis" : "Full Analysis"
          }
        ),
        /* @__PURE__ */ u(
          "div",
          {
            style: {
              display: "grid",
              gridTemplateColumns: "minmax(220px, 1fr) minmax(320px, 2fr)",
              gap: 20
            },
            children: [
              /* @__PURE__ */ u("div", { children: [
                /* @__PURE__ */ i("h3", { style: { margin: "0 0 12px 0", fontSize: 14, color: "#374151" }, children: "Inputs" }),
                /* @__PURE__ */ u("div", { style: z, children: [
                  /* @__PURE__ */ i("label", { style: L, children: "Home Value ($)" }),
                  /* @__PURE__ */ i(
                    "input",
                    {
                      type: "text",
                      inputMode: "numeric",
                      style: C,
                      value: h.toLocaleString(),
                      onChange: (c) => {
                        y && f(!0), S(Y(c.target.value, h));
                      }
                    }
                  )
                ] }),
                /* @__PURE__ */ u("div", { style: z, children: [
                  /* @__PURE__ */ i("label", { style: L, children: "Initial Buy Amount ($)" }),
                  /* @__PURE__ */ i(
                    "input",
                    {
                      type: "text",
                      inputMode: "numeric",
                      style: C,
                      value: _.toLocaleString(),
                      onChange: (c) => {
                        y && f(!0), b(
                          Y(c.target.value, _)
                        );
                      }
                    }
                  )
                ] }),
                /* @__PURE__ */ u("div", { style: z, children: [
                  /* @__PURE__ */ i("label", { style: L, children: "Term (years)" }),
                  /* @__PURE__ */ i(
                    "input",
                    {
                      type: "number",
                      min: 1,
                      max: 30,
                      step: 1,
                      style: C,
                      value: x,
                      onChange: (c) => {
                        const p = parseInt(c.target.value, 10);
                        Number.isFinite(p) && p >= 1 && p <= 30 && (y && f(!0), R(p));
                      }
                    }
                  )
                ] }),
                /* @__PURE__ */ u("div", { style: z, children: [
                  /* @__PURE__ */ i("label", { style: L, children: "Annual Growth Rate (%)" }),
                  /* @__PURE__ */ i(
                    "input",
                    {
                      type: "number",
                      min: 0,
                      max: 20,
                      step: 0.1,
                      style: C,
                      value: M,
                      onChange: (c) => {
                        const p = parseFloat(c.target.value);
                        Number.isFinite(p) && p >= 0 && p <= 20 && (y && f(!0), l(p));
                      }
                    }
                  )
                ] })
              ] }),
              /* @__PURE__ */ u("div", { children: [
                /* @__PURE__ */ u(
                  "div",
                  {
                    style: {
                      ...J,
                      marginBottom: 16,
                      textAlign: "center"
                    },
                    children: [
                      /* @__PURE__ */ i("div", { style: { fontSize: 12, color: "#6b7280", marginBottom: 4 }, children: w.heroLabel }),
                      /* @__PURE__ */ i("div", { style: { fontSize: 28, fontWeight: 700, color: "#111827" }, children: T(tt) }),
                      /* @__PURE__ */ i("div", { style: { fontSize: 11, color: "#9ca3af", marginTop: 4 }, children: w.helperText })
                    ]
                  }
                ),
                /* @__PURE__ */ i("h3", { style: { margin: "0 0 8px 0", fontSize: 14, color: "#374151" }, children: "Settlement Scenarios" }),
                /* @__PURE__ */ i(
                  "div",
                  {
                    style: {
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      marginBottom: 16
                    },
                    children: et.map((c) => /* @__PURE__ */ u(
                      "div",
                      {
                        style: {
                          ...J,
                          display: "grid",
                          gridTemplateColumns: A ? "1fr 1fr 1fr" : "1fr 1fr 1fr 1fr 1fr 1fr",
                          gap: 8,
                          alignItems: "center",
                          padding: "10px 12px"
                        },
                        children: [
                          /* @__PURE__ */ u("div", { children: [
                            /* @__PURE__ */ i("div", { style: { fontSize: 11, color: "#9ca3af" }, children: "Timing" }),
                            /* @__PURE__ */ i("div", { style: { fontWeight: 600, fontSize: 13 }, children: c.label })
                          ] }),
                          /* @__PURE__ */ u("div", { children: [
                            /* @__PURE__ */ i("div", { style: { fontSize: 11, color: "#9ca3af" }, children: "When" }),
                            /* @__PURE__ */ i("div", { style: { fontSize: 13 }, children: Wt(c.data.settlementMonth) })
                          ] }),
                          /* @__PURE__ */ u("div", { children: [
                            /* @__PURE__ */ i("div", { style: { fontSize: 11, color: "#9ca3af" }, children: "Net Payout" }),
                            /* @__PURE__ */ i("div", { style: { fontWeight: 600, fontSize: 13 }, children: T(c.data.netPayout) })
                          ] }),
                          !A && /* @__PURE__ */ u($, { children: [
                            /* @__PURE__ */ u("div", { children: [
                              /* @__PURE__ */ i("div", { style: { fontSize: 11, color: "#9ca3af" }, children: "Raw Payout" }),
                              /* @__PURE__ */ i("div", { style: { fontSize: 13 }, children: T(c.data.rawPayout) })
                            ] }),
                            /* @__PURE__ */ u("div", { children: [
                              /* @__PURE__ */ i("div", { style: { fontSize: 11, color: "#9ca3af" }, children: "Transfer Fee" }),
                              /* @__PURE__ */ u("div", { style: { fontSize: 13 }, children: [
                                T(c.data.transferFeeAmount),
                                " (",
                                G(c.data.transferFeeRate),
                                ")"
                              ] })
                            ] }),
                            /* @__PURE__ */ u("div", { children: [
                              /* @__PURE__ */ i("div", { style: { fontSize: 11, color: "#9ca3af" }, children: "Clamp" }),
                              /* @__PURE__ */ i("div", { style: { fontSize: 13 }, children: c.data.clamp.applied === "none" ? "—" : c.data.clamp.applied === "floor" ? "Floor" : "Cap" })
                            ] })
                          ] })
                        ]
                      },
                      c.label
                    ))
                  }
                ),
                !A && /* @__PURE__ */ i(Bt, { series: F, width: 520, height: 240 }),
                /* @__PURE__ */ u(
                  "div",
                  {
                    style: {
                      display: "flex",
                      gap: 10,
                      marginTop: 16,
                      flexWrap: "wrap"
                    },
                    children: [
                      A && /* @__PURE__ */ u($, { children: [
                        /* @__PURE__ */ i(
                          "button",
                          {
                            type: "button",
                            onClick: nt,
                            style: {
                              ...U,
                              background: "#111827",
                              color: "#fff"
                            },
                            "data-cta": "save-continue",
                            children: "Save & Continue"
                          }
                        ),
                        /* @__PURE__ */ i(
                          "button",
                          {
                            type: "button",
                            onClick: at,
                            style: {
                              ...U,
                              background: "#fff",
                              color: "#111827",
                              border: "1px solid #d1d5db"
                            },
                            "data-cta": "share",
                            children: "Share"
                          }
                        )
                      ] }),
                      !A && /* @__PURE__ */ i(
                        "button",
                        {
                          type: "button",
                          onClick: rt,
                          style: {
                            ...U,
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
        /* @__PURE__ */ u(
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
              /* @__PURE__ */ i("strong", { children: e }),
              " · ",
              "Mode: ",
              /* @__PURE__ */ i("strong", { children: n }),
              " · ",
              T(h),
              " home · ",
              T(_),
              " ",
              "buy · ",
              x,
              "yr · ",
              G(M / 100),
              " growth"
            ]
          }
        )
      ]
    }
  );
}
function te(t) {
  return /* @__PURE__ */ i(Qt, { ...t });
}
export {
  W as CONTRACT_VERSION,
  Bt as EquityChart,
  te as FractPathCalculatorWidget,
  Zt as SCHEMA_VERSION,
  Nt as buildChartSeries,
  Gt as buildDraftSnapshot,
  Jt as buildSavePayload,
  Ht as buildShareSummary,
  It as computeScenario,
  I as deterministicHash,
  kt as normalizeInputs
};
