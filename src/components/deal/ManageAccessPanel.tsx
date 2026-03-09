"use client";

import { useCallback, useEffect, useState } from "react";

type Grant = {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
  expires_at: string | null;
};

type ManageAccessPanelProps = {
  dealId: string;
};

export function ManageAccessPanel({ dealId }: ManageAccessPanelProps) {
  const [open, setOpen] = useState(false);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  const fetchGrants = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/deals/${dealId}/access`);
      const body = await res.json();
      if (!res.ok || !body.ok) {
        throw new Error(body.error ?? "Failed to load grants");
      }
      setGrants(body.grants ?? []);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [dealId]);

  useEffect(() => {
    if (open) fetchGrants();
  }, [open, fetchGrants]);

  const handleRevoke = useCallback(
    async (grantId: string) => {
      setRevoking(grantId);
      setError(null);
      try {
        const res = await fetch(`/api/deals/${dealId}/access/revoke`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ grantId }),
        });
        const body = await res.json();
        if (!res.ok || !body.ok) {
          throw new Error(body.error ?? "Revoke failed");
        }
        setGrants((prev) => prev.filter((g) => g.id !== grantId));
      } catch (err: any) {
        setError(err?.message ?? "Revoke failed");
      } finally {
        setRevoking(null);
      }
    },
    [dealId],
  );

  function shortUserId(uid: string) {
    if (uid.length <= 12) return uid;
    return `${uid.slice(0, 6)}\u2026${uid.slice(-4)}`;
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-sm underline text-muted-foreground hover:text-foreground"
      >
        Manage access
      </button>
    );
  }

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Manage Access</h3>
        <button
          onClick={() => setOpen(false)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Close
        </button>
      </div>

      {error ? (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading grants...</p>
      ) : grants.length === 0 ? (
        <p className="text-sm text-muted-foreground">No active grants.</p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="pb-1 pr-2 font-medium">User</th>
              <th className="pb-1 pr-2 font-medium">Role</th>
              <th className="pb-1 pr-2 font-medium">Granted</th>
              <th className="pb-1 pr-2 font-medium">Expires</th>
              <th className="pb-1 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {grants.map((g) => (
              <tr key={g.id} className="border-b last:border-0">
                <td className="py-1.5 pr-2 font-mono">
                  {shortUserId(g.user_id)}
                </td>
                <td className="py-1.5 pr-2">{g.role}</td>
                <td className="py-1.5 pr-2 text-muted-foreground">
                  {g.created_at
                    ? new Date(g.created_at).toLocaleDateString()
                    : "\u2014"}
                </td>
                <td className="py-1.5 pr-2 text-muted-foreground">
                  {g.expires_at
                    ? new Date(g.expires_at).toLocaleDateString()
                    : "\u2014"}
                </td>
                <td className="py-1.5 text-right">
                  {g.role !== "OWNER" ? (
                    <button
                      onClick={() => handleRevoke(g.id)}
                      disabled={revoking === g.id}
                      className="rounded bg-red-100 px-2 py-0.5 text-red-700 hover:bg-red-200 disabled:opacity-50 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900"
                    >
                      {revoking === g.id ? "Revoking\u2026" : "Revoke"}
                    </button>
                  ) : (
                    <span className="text-muted-foreground">\u2014</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
