import { roundMoney } from "./rounding.js";
import { computeIRR } from "./irr.js";
import { COMPUTE_VERSION } from "./version.js";
export function computeDeal(terms, assumptions) {
    const exitMonth = Math.floor(assumptions.exit_year * 12);
    const paymentsMade = Math.min(terms.number_of_payments, exitMonth);
    const invested_capital_total = roundMoney(terms.upfront_payment + sumPayments(terms.monthly_payment, paymentsMade));
    const projected_fmv = roundMoney(computeFMV(terms, assumptions));
    const vested_equity_percentage = computeVestedEquity(terms, assumptions.annual_appreciation, paymentsMade);
    const base_equity_value = roundMoney(projected_fmv * vested_equity_percentage);
    const gain_above_capital = roundMoney(base_equity_value - invested_capital_total);
    const tf = computeTimingFactor(terms, assumptions.exit_year);
    const isa_pre_floor_cap = roundMoney(invested_capital_total + gain_above_capital * tf);
    const floor_amount = roundMoney(invested_capital_total * terms.floor_multiple);
    const ceiling_amount = roundMoney(invested_capital_total * terms.ceiling_multiple);
    const isa_standard = roundMoney(computeSettlement(terms.downside_mode, isa_pre_floor_cap, floor_amount, ceiling_amount));
    const { isa_settlement, dyf_floor_amount, dyf_applied } = applyDurationYieldFloor(terms, assumptions.exit_year, invested_capital_total, isa_standard);
    const investor_profit = roundMoney(isa_settlement - invested_capital_total);
    const investor_multiple = roundMoney(invested_capital_total > 0 ? isa_settlement / invested_capital_total : 0);
    const cashflows = buildCashflows(terms, paymentsMade, exitMonth, isa_settlement);
    const investor_irr_annual = computeIRR(cashflows);
    return {
        invested_capital_total,
        vested_equity_percentage,
        projected_fmv,
        base_equity_value,
        gain_above_capital,
        isa_pre_floor_cap,
        floor_amount,
        ceiling_amount,
        isa_settlement,
        dyf_floor_amount,
        dyf_applied,
        investor_profit,
        investor_multiple,
        investor_irr_annual,
        compute_version: COMPUTE_VERSION,
    };
}
function sumPayments(monthly, count) {
    return monthly * count;
}
function computeFMV(terms, assumptions) {
    if (assumptions.fmv_override !== undefined &&
        assumptions.fmv_override !== null &&
        assumptions.fmv_override > 0) {
        return assumptions.fmv_override;
    }
    return terms.property_value * Math.pow(1 + assumptions.annual_appreciation, assumptions.exit_year);
}
function computeVestedEquity(terms, annualAppreciation, paymentsCount) {
    const upfrontEquity = terms.upfront_payment / terms.property_value;
    let monthlyEquityTotal = 0;
    for (let m = 1; m <= paymentsCount; m++) {
        const pvAtMonth = terms.property_value * Math.pow(1 + annualAppreciation, m / 12);
        monthlyEquityTotal += terms.monthly_payment / pvAtMonth;
    }
    return upfrontEquity + monthlyEquityTotal;
}
function computeTimingFactor(terms, exitYear) {
    if (exitYear < terms.payback_window_start_year) {
        return terms.timing_factor_early;
    }
    if (exitYear > terms.payback_window_end_year) {
        return terms.timing_factor_late;
    }
    return 1;
}
function computeSettlement(downsideMode, isaPre, floor, ceiling) {
    if (downsideMode === "HARD_FLOOR") {
        return Math.min(Math.max(isaPre, floor), ceiling);
    }
    return Math.min(isaPre, ceiling);
}
function applyDurationYieldFloor(terms, exitYear, iba, isaStandard) {
    if (!terms.duration_yield_floor_enabled ||
        terms.duration_yield_floor_start_year == null ||
        terms.duration_yield_floor_min_multiple == null) {
        return { isa_settlement: isaStandard, dyf_floor_amount: 0, dyf_applied: false };
    }
    const dyfFloor = roundMoney(iba * terms.duration_yield_floor_min_multiple);
    if (exitYear >= terms.duration_yield_floor_start_year && isaStandard < dyfFloor) {
        return { isa_settlement: dyfFloor, dyf_floor_amount: dyfFloor, dyf_applied: true };
    }
    return { isa_settlement: isaStandard, dyf_floor_amount: dyfFloor, dyf_applied: false };
}
function buildCashflows(terms, paymentsCount, exitMonth, isaSettlement) {
    const cf = new Array(exitMonth + 1).fill(0);
    cf[0] = -terms.upfront_payment;
    for (let m = 1; m <= paymentsCount; m++) {
        cf[m] = -terms.monthly_payment;
    }
    cf[exitMonth] += isaSettlement;
    return cf;
}
