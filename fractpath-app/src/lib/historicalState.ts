export interface HistoricalStateInput {
  selectedId: string | null;
  latestId: string | null;
  dealId: string;
}

export interface HistoricalState {
  isHistorical: boolean;
  backToLatestHref: string;
}

export function computeHistoricalState(input: HistoricalStateInput): HistoricalState {
  const backToLatestHref = `/deal/${input.dealId}`;

  if (!input.selectedId) {
    return { isHistorical: false, backToLatestHref };
  }

  if (!input.latestId) {
    return { isHistorical: true, backToLatestHref };
  }

  return {
    isHistorical: input.selectedId !== input.latestId,
    backToLatestHref,
  };
}
