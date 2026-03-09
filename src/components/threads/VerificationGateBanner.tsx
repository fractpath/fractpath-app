"use client";

import Link from "next/link";
import { useThreadVerificationStatus } from "@/hooks/useThreadVerificationStatus";

export function VerificationGateBanner({ threadId }: { threadId: string }) {
  const { loading, error, data } = useThreadVerificationStatus(threadId);

  if (loading || error || !data || data.accept_allowed) return null;

  const status = data.property_status;

  if (status === "under_review") {
    return (
      <div
        data-testid="verification-gate-banner"
        className="mb-4 rounded-lg border border-blue-300 bg-blue-50 px-4 py-3 text-sm text-blue-900"
      >
        <p className="font-medium">Verification in progress</p>
        <p className="mt-1 text-blue-700">
          FractPath is reviewing your submitted documents. You will be able to
          accept once verification is complete.
        </p>
      </div>
    );
  }

  return (
    <div
      data-testid="verification-gate-banner"
      className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
    >
      <p className="font-medium">Property verification required to accept</p>
      {data.verify_url ? (
        <Link
          href={data.verify_url}
          className="mt-1 inline-block text-amber-700 underline hover:text-amber-900"
        >
          Go to your properties
        </Link>
      ) : null}
    </div>
  );
}
