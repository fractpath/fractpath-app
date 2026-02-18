export interface CalcInput {
  home_value: number;
  fractional_percent: number;
  term_years: number;
  appreciation_rate: number;
  discount_rate: number;
  inflation_rate?: number;
  monthly_rent?: number;
}

export interface ScheduleRow {
  year: number;
  home_value: number;
  fractional_value: number;
  homeowner_equity: number;
  investor_equity: number;
  cumulative_appreciation: number;
}

export interface SettlementCase {
  exit_year: number;
  home_value_at_exit: number;
  investor_payout: number;
  homeowner_net: number;
}

export interface Summary {
  home_value: number;
  fractional_percent: number;
  buy_amount: number;
  term_years: number;
  appreciation_rate: number;
  discount_rate: number;
  estimated_end_value: number;
  investor_share_at_exit: number;
  homeowner_net_at_exit: number;
  total_return_multiple: number;
}

export interface CalcOutput {
  terms_version: string;
  outputs: {
    summary: Summary;
    schedule: ScheduleRow[];
    settlements: {
      early: SettlementCase;
      standard: SettlementCase;
      late: SettlementCase;
    };
  };
}
