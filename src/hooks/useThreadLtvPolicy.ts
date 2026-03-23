"use client";

import { useCallback, useEffect, useState } from "react";
import type { LtvPolicyResult } from "@/lib/ltvPolicy";

export type ThreadLtvPolicyData = LtvPolicyResult & {
  latest_verified_fmv: number | null;
  fmv_verified_at: string | null;
  secured_debt_amount: number;
  ltv_policy_ratio: number;
  verify_url: string | null;
};

export function useThreadLtvPolicy(threadId: string | null) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ThreadLtvPolicyData | null>(null);

  const refresh = useCallback(async () => {
    if (!threadId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/threads/${threadId}/ltv-policy`, {
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error ?? `HTTP ${res.status}`);
        return;
      }
      const json = await res.json();
      setData(json as ThreadLtvPolicyData);
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
