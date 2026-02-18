export function roundMoney(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}
export function roundIRRMonthly(value) {
    return Math.round((value + Number.EPSILON) * 1e6) / 1e6;
}
export function roundIRRAnnual(value) {
    return Math.round((value + Number.EPSILON) * 1e4) / 1e4;
}
