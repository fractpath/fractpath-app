"use client";

import { useCallback, useEffect, useState } from "react";

export type VerificationStatusData = {
  property_id: string | null;
  property_status: string | null;
  ownership_status: string | null;
  claimed_by_user_id: string | null;
  accept_allowed: boolean;
  verify_url: string | null;
};

export function useThreadVerificationStatus(threadId: string) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<VerificationStatusData | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/threads/${threadId}/verification-status`,
        { credentials: "include" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error ?? `HTTP ${res.status}`);
        return;
      }
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err?.message ?? "Network error");
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { loading, error, data, refresh };
}
