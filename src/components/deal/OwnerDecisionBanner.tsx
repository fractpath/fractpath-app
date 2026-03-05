"use client";

type Props = {
  onReviewClick: () => void;
};

export function OwnerDecisionBanner({ onReviewClick }: Props) {
  return (
    <div
      className="rounded-md border border-amber-300 bg-amber-50 p-4"
      data-testid="owner-decision-banner"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
          </span>
          <span className="text-sm font-medium text-amber-900">
            Offer awaiting your decision
          </span>
        </div>
        <button
          type="button"
          onClick={onReviewClick}
          className="shrink-0 rounded-md border border-amber-400 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
          data-testid="owner-review-decide-btn"
        >
          Review
        </button>
      </div>
    </div>
  );
}
