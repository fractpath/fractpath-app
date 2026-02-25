"use client";

import { useState } from "react";
import { LoadingButton } from "@/components/ui/LoadingButton";
import { useToast } from "@/components/ui/Toast";

export function PropertyForm(props: { onSuccess?: () => void }) {
  const t = useToast();
  const [address, setAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    const trimmed = address.trim();
    if (!trimmed) return t.error("Address is required.");

    setSubmitting(true);
    try {
      const res = await fetch("/api/me/properties", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: trimmed }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok)
        return t.error(json?.error || "Couldn’t save that — try again.");

      t.success("Property added. Verification is coming soon.");
      setAddress("");
      props.onSuccess?.();
    } catch {
      t.error("Something went sideways. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="space-y-1">
        <div className="text-sm font-medium">Property address</div>
        <div className="text-xs text-muted-foreground">
          Add one address for now — we’ll support verification soon.
        </div>
        <input
          className="w-full rounded-md border px-3 py-2 text-sm"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="123 Main St, City, ST 12345"
          required
        />
      </label>

      <LoadingButton loading={submitting} type="submit">
        Add property
      </LoadingButton>
    </form>
  );
}
