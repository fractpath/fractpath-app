"use client";

export function AcceptedPendingReviewBanner() {
  return (
    <div
      className="rounded-lg border border-green-300 bg-green-50 p-4 dark:border-green-700 dark:bg-green-950"
      data-testid="accepted-pending-review-banner"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-green-600 dark:text-green-400 flex-shrink-0">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-4 h-4"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
              clipRule="evenodd"
            />
          </svg>
        </span>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-green-900 dark:text-green-100">
            Accepted – pending review
          </p>
          <p className="text-xs text-green-800 dark:text-green-200">
            This offer has been accepted and is now in our internal review queue.
            Our team will be in touch with next steps.
          </p>
        </div>
      </div>
    </div>
  );
}
