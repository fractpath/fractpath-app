"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";

type Props = {
  open: boolean;
  onClose: () => void;
  dealId: string;
};

export function ShareDealModal({ open, onClose, dealId }: Props) {
  const [email, setEmail] = useState("");
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerateLink() {
    setGenerating(true);
    setError(null);
    setCopied(false);
    try {
      const res = await fetch(`/api/deals/${dealId}/share`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? `Failed to generate link (${res.status})`);
        return;
      }
      const token = body?.token ?? body?.share_token;
      if (token) {
        const url = `${window.location.origin}/share?t=${encodeURIComponent(token)}`;
        setShareUrl(url);
      } else {
        setError("No share token returned.");
      }
    } catch {
      setError("Network error — try again.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleCopy() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy to clipboard.");
    }
  }

  function handleClose() {
    setEmail("");
    setShareUrl(null);
    setError(null);
    setCopied(false);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Share this deal"
      secondaryLabel="Close"
      onSecondary={handleClose}
    >
      <div className="space-y-4">
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">
            Email address
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="colleague@example.com"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1"
          />
          <p className="text-xs text-muted-foreground">
            Email sharing is coming soon. Use the link below to share now.
          </p>
        </div>

        <div className="border-t pt-3 space-y-2">
          <button
            type="button"
            onClick={handleGenerateLink}
            disabled={generating}
            className="inline-flex items-center gap-2 rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background disabled:opacity-50"
          >
            {generating ? "Generating..." : shareUrl ? "Regenerate link" : "Generate link"}
          </button>

          {shareUrl && (
            <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-2">
              <input
                type="text"
                readOnly
                value={shareUrl}
                className="flex-1 bg-transparent text-xs font-mono truncate outline-none"
              />
              <button
                type="button"
                onClick={handleCopy}
                className="shrink-0 rounded border px-2 py-1 text-xs font-medium hover:bg-muted"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          )}
        </div>

        {error && (
          <div className="text-xs text-red-600">{error}</div>
        )}
      </div>
    </Modal>
  );
}
