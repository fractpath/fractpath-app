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
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  async function callShare(includeEmail: boolean) {
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    setWarning(null);
    setCopied(false);
    try {
      const payload: Record<string, string> = {};
      if (includeEmail && email.trim()) {
        payload.email = email.trim();
      }
      const res = await fetch(`/api/deals/${dealId}/share`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? `Failed to generate link (${res.status})`);
        return;
      }
      const url = body?.shareUrl;
      if (!url) {
        const token = body?.token ?? body?.share_token;
        if (token) {
          setShareUrl(`${window.location.origin}/share?t=${encodeURIComponent(token)}`);
        } else {
          setError("No share token returned.");
          return;
        }
      } else {
        setShareUrl(url);
      }

      if (body?.emailed) {
        setSuccessMsg(`Share link sent to ${payload.email ?? email.trim()}`);
      }
      if (body?.warning) {
        setWarning(body.warning);
      }
    } catch {
      setError("Network error — try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSendEmail() {
    await callShare(true);
  }

  async function handleGenerateLink() {
    await callShare(false);
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
    setSuccessMsg(null);
    setWarning(null);
    setCopied(false);
    onClose();
  }

  const emailValid = email.trim().includes("@") && email.trim().length <= 254;

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
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSendEmail}
            disabled={loading || !emailValid}
            className="inline-flex items-center gap-2 rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background disabled:opacity-50"
          >
            {loading ? "Sending..." : "Send share link"}
          </button>
          <button
            type="button"
            onClick={handleGenerateLink}
            disabled={loading}
            className="rounded-md border bg-white px-3 py-2 text-sm font-medium disabled:opacity-50"
          >
            {shareUrl ? "Regenerate link" : "Copy link only"}
          </button>
        </div>

        {successMsg && (
          <div className="rounded-md border border-green-200 bg-green-50 p-2 text-xs text-green-800">
            {successMsg}
          </div>
        )}

        {warning && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
            {warning}
          </div>
        )}

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

        {error && (
          <div className="text-xs text-red-600">{error}</div>
        )}
      </div>
    </Modal>
  );
}
