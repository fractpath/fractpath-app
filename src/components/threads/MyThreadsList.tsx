"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type ThreadRow = {
  id: string;
  property_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export function MyThreadsList() {
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/me/threads", { credentials: "include" });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body?.error ?? `HTTP ${res.status}`);
          return;
        }
        const json = await res.json();
        setThreads(json.threads ?? []);
      } catch (err: any) {
        setError(err?.message ?? "Network error");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <p className="p-6 text-gray-500">Loading threads...</p>;

  if (error) {
    return (
      <div className="p-6">
        <p className="text-red-600 font-medium">{error}</p>
      </div>
    );
  }

  if (threads.length === 0) {
    return <p className="p-6 text-gray-500">No threads yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs font-semibold uppercase text-gray-500">
            <th className="px-4 py-3">Thread</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Property</th>
            <th className="px-4 py-3">Updated</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {threads.map((t) => (
            <tr key={t.id} className="border-b hover:bg-gray-50">
              <td className="px-4 py-3 font-mono text-xs">{t.id.slice(0, 8)}...</td>
              <td className="px-4 py-3">
                <span className="inline-block rounded bg-gray-100 px-2 py-0.5 text-xs font-semibold">
                  {t.status}
                </span>
              </td>
              <td className="px-4 py-3 font-mono text-xs">
                {t.property_id ? `${t.property_id.slice(0, 8)}...` : "—"}
              </td>
              <td className="px-4 py-3 text-xs text-gray-500">
                {new Date(t.updated_at).toLocaleString()}
              </td>
              <td className="px-4 py-3">
                <Link
                  href={`/threads/${t.id}`}
                  className="text-blue-600 underline hover:text-blue-800"
                >
                  View
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
