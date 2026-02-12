"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SCHEMA_VERSION = exports.TERMS_VERSION = void 0;
exports.computeDeal = computeDeal;
exports.TERMS_VERSION = "fractpath-terms-v1.0";
exports.SCHEMA_VERSION = "1";
function validateInputs(raw) {
    const home_value = Number(raw.home_value);
    const fractional_percent = Number(raw.fractional_percent);
    const term_years = Number(raw.term_years);
    const appreciation_rate = Number(raw.appreciation_rate);
    const discount_rate = Number(raw.discount_rate);
    const inflation_rate = raw.inflation_rate != null ? Number(raw.inflation_rate) : 0;
    const monthly_rent = raw.monthly_rent != null ? Number(raw.monthly_rent) : 0;
    if (!Number.isFinite(home_value) || home_value <= 0) {
        throw new Error("home_value must be a positive number");
    }
    if (!Number.isFinite(fractional_percent) ||
        fractional_percent <= 0 ||
        fractional_percent > 100) {
        throw new Error("fractional_percent must be between 0 and 100");
    }
    if (!Number.isFinite(term_years) ||
        term_years < 1 ||
        term_years > 30 ||
        term_years !== Math.floor(term_years)) {
        throw new Error("term_years must be an integer between 1 and 30");
    }
    if (!Number.isFinite(appreciation_rate)) {
        throw new Error("appreciation_rate must be a number");
    }
    if (!Number.isFinite(discount_rate)) {
        throw new Error("discount_rate must be a number");
    }
    return {
        home_value,
        fractional_percent,
        term_years,
        appreciation_rate,
        discount_rate,
        inflation_rate,
        monthly_rent,
    };
}
function round2(n) {
    return Math.round(n * 100) / 100;
}
function buildSchedule(input) {
    const { home_value, fractional_percent, term_years, appreciation_rate } = input;
    const frac = fractional_percent / 100;
    const schedule = [];
    for (let year = 0; year <= term_years; year++) {
        const hv = home_value * Math.pow(1 + appreciation_rate / 100, year);
        const fractionalValue = hv * frac;
        const homeownerEquity = hv - fractionalValue;
        const cumulativeAppreciation = year === 0 ? 0 : ((hv - home_value) / home_value) * 100;
        schedule.push({
            year,
            home_value: round2(hv),
            fractional_value: round2(fractionalValue),
            homeowner_equity: round2(homeownerEquity),
            investor_equity: round2(fractionalValue),
            cumulative_appreciation: round2(cumulativeAppreciation),
        });
    }
    return schedule;
}
function buildSettlement(input, exitYear) {
    const { home_value, fractional_percent, discount_rate } = input;
    const frac = fractional_percent / 100;
    const buyAmount = home_value * frac;
    const hvAtExit = home_value * Math.pow(1 + input.appreciation_rate / 100, exitYear);
    const investorShare = hvAtExit * frac;
    const discountFactor = Math.pow(1 + discount_rate / 100, exitYear);
    const investorPayout = investorShare / discountFactor;
    const homeownerNet = hvAtExit - investorPayout;
    return {
        exit_year: exitYear,
        home_value_at_exit: round2(hvAtExit),
        investor_payout: round2(investorPayout),
        homeowner_net: round2(homeownerNet),
    };
}
function buildSummary(input, schedule) {
    const { home_value, fractional_percent, term_years, appreciation_rate, discount_rate } = input;
    const frac = fractional_percent / 100;
    const buyAmount = home_value * frac;
    const endRow = schedule[schedule.length - 1];
    const investorShareAtExit = endRow.fractional_value;
    const homeownerNet = endRow.home_value - investorShareAtExit;
    const totalReturnMultiple = buyAmount > 0 ? investorShareAtExit / buyAmount : 0;
    return {
        home_value,
        fractional_percent,
        buy_amount: round2(buyAmount),
        term_years,
        appreciation_rate,
        discount_rate,
        estimated_end_value: round2(endRow.home_value),
        investor_share_at_exit: round2(investorShareAtExit),
        homeowner_net_at_exit: round2(homeownerNet),
        total_return_multiple: round2(totalReturnMultiple),
    };
}
function computeDeal(rawInputs) {
    const input = validateInputs(rawInputs);
    const schedule = buildSchedule(input);
    const summary = buildSummary(input, schedule);
    const earlyYear = Math.max(1, Math.floor(input.term_years / 3));
    const standardYear = input.term_years;
    const lateYear = Math.min(input.term_years + 5, 30);
    const settlements = {
        early: buildSettlement(input, earlyYear),
        standard: buildSettlement(input, standardYear),
        late: buildSettlement(input, lateYear),
    };
    return {
        terms_version: exports.TERMS_VERSION,
        outputs: {
            summary,
            schedule,
            settlements,
        },
    };
}
//# sourceMappingURL=compute.js.map