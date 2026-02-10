'use client';

import { useMemo, useState } from "react";

export function ShareDealCard({ dealId }: { dealId: string }) {
  const [toEmail, setToEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    const e = toEmail.trim();
    return e.length > 3 && e.includes("@");
  }, [toEmail]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setShareUrl(null);

    try {
      const res = await fetch(`/api/deals/${dealId}/share`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ toEmail }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(json?.error ?? `Request failed (${res.status})`);
        return;
      }

      setShareUrl(json.shareUrl ?? null);
    } catch (err: any) {
      setError(err?.message ?? "Request failed");
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      // ignore
    }
  }

  return (
    <section className="rounded-md border p-4">
      <h2 className="text-sm font-medium">Share this deal</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Invite someone to view this deal in read-only mode.
      </p>

      <form className="mt-3 flex flex-col gap-3" onSubmit={onSubmit}>
        <label className="text-sm">
          Recipient email
          <input
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            value={toEmail}
            onChange={(e) => setToEmail(e.target.value)}
            placeholder="name@example.com"
            autoComplete="email"
          />
        </label>

        <button
          className="rounded-md border px-3 py-2 text-sm"
          disabled={!canSubmit || loading}
          type="submit"
        >
          {loading ? "Sending…" : "Send share link"}
        </button>
      </form>

      {error ? (
        <div className="mt-3 rounded-md border p-3 text-sm">
          <div className="font-medium">Error</div>
          <div className="mt-1 text-muted-foreground break-words">{error}</div>
        </div>
      ) : null}

      {shareUrl ? (
        <div className="mt-3 rounded-md border p-3 text-sm">
          <div className="font-medium">Share link</div>
          <div className="mt-1 text-muted-foreground break-words">{shareUrl}</div>
          <button className="mt-2 underline text-sm" onClick={copy} type="button">
            Copy link
          </button>
        </div>
      ) : null}
    </section>
  );
}
