"use client";

import Link from "next/link";
import { useThreadVerificationStatus } from "@/hooks/useThreadVerificationStatus";

export function VerificationGateBanner({ threadId }: { threadId: string }) {
  const { loading, error, data } = useThreadVerificationStatus(threadId);

  if (loading || error || !data || data.accept_allowed) return null;

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
          Verify property
        </Link>
      ) : null}
    </div>
  );
}
