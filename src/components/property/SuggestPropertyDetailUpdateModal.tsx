"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import type { PropertyFactCorrection } from "@/lib/property/photos";
import { CORRECTABLE_FIELDS } from "@/lib/property/photos";

type Props = {
  propertyId: string;
  existingCorrections: PropertyFactCorrection[];
  /** Map of field_key → current canonical value (from RentCast/normalized record) */
  canonicalValues: Record<string, string | number | null>;
  onClose: () => void;
  onSubmitted: (correction: PropertyFactCorrection) => void;
};

const STATUS_LABELS: Record<PropertyFactCorrection["review_status"], { label: string; cls: string }> = {
  pending: { label: "Pending review", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  approved: { label: "Approved", cls: "bg-green-50 text-green-700 border-green-200" },
  rejected: { label: "Not accepted", cls: "bg-red-50 text-red-700 border-red-200" },
};

export function SuggestPropertyDetailUpdateModal({
  propertyId,
  existingCorrections,
  canonicalValues,
  onClose,
  onSubmitted,
}: Props) {
  const [selectedField, setSelectedField] = useState<string>("");
  const [newValue, setNewValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const correctionsByField = Object.fromEntries(
    existingCorrections.map((c) => [c.field_key, c]),
  );

  const fieldDef = CORRECTABLE_FIELDS.find((f) => f.key === selectedField);
  const existingForField = selectedField ? correctionsByField[selectedField] : null;
  const blockedByExisting =
    existingForField?.review_status === "pending" ||
    existingForField?.review_status === "approved";

  async function handleSubmit() {
    if (!fieldDef || !newValue.trim()) return;
    setSubmitting(true);
    setError(null);

    const res = await fetch(`/api/me/properties/${propertyId}/corrections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        field_key: selectedField,
        owner_submitted_value: newValue.trim(),
        canonical_value:
          canonicalValues[selectedField] != null
            ? String(canonicalValues[selectedField])
            : null,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      onSubmitted(data.correction);
      setSelectedField("");
      setNewValue("");
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to submit. Please try again.");
    }
    setSubmitting(false);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Suggest a detail update"
      description="Let our team know if a recorded detail about your property needs correction. All suggestions are reviewed before being applied."
      size="lg"
      primaryLabel={
        blockedByExisting
          ? "Correction already submitted"
          : "Submit suggestion"
      }
      primaryDisabled={
        !selectedField || !newValue.trim() || blockedByExisting || submitting
      }
      primaryLoading={submitting}
      onPrimary={handleSubmit}
      secondaryLabel="Cancel"
      onSecondary={onClose}
    >
      <div className="space-y-5">
        {/* ── Existing corrections overview ─────────────────────────────────── */}
        {existingCorrections.length > 0 && (
          <div className="rounded-lg border p-3 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Your submitted corrections
            </p>
            {existingCorrections.map((c) => {
              const badge = STATUS_LABELS[c.review_status];
              return (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="font-medium">{c.display_label}</span>
                  <div className="flex items-center gap-2 flex-none">
                    <span className="text-muted-foreground text-xs">
                      {c.owner_submitted_value}
                    </span>
                    <span
                      className={`inline-block text-[11px] font-medium border rounded px-1.5 py-0.5 ${badge.cls}`}
                    >
                      {badge.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Field selector ────────────────────────────────────────────────── */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium" htmlFor="field-select">
            Which detail needs correction?
          </label>
          <select
            id="field-select"
            value={selectedField}
            onChange={(e) => {
              setSelectedField(e.target.value);
              setNewValue("");
              setError(null);
            }}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">— Select a field —</option>
            {CORRECTABLE_FIELDS.map((f) => {
              const existing = correctionsByField[f.key];
              const blocked =
                existing?.review_status === "pending" ||
                existing?.review_status === "approved";
              return (
                <option key={f.key} value={f.key} disabled={blocked}>
                  {f.label}
                  {blocked
                    ? ` (${existing!.review_status})`
                    : existing?.review_status === "rejected"
                    ? " (rejected — resubmit allowed)"
                    : ""}
                </option>
              );
            })}
          </select>
        </div>

        {/* ── Current vs. suggested ────────────────────────────────────────── */}
        {fieldDef && (
          <div className="rounded-lg border divide-y">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-muted-foreground">
                Currently recorded
              </span>
              <span className="text-sm font-medium">
                {canonicalValues[selectedField] != null
                  ? String(canonicalValues[selectedField])
                  : "—"}
                {fieldDef.unit ? ` ${fieldDef.unit}` : ""}
              </span>
            </div>
            <div className="px-4 py-3 space-y-1.5">
              <label
                className="block text-sm text-muted-foreground"
                htmlFor="new-value"
              >
                Your suggested value
                {fieldDef.unit ? ` (${fieldDef.unit})` : ""}
              </label>
              <input
                id="new-value"
                type="text"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                disabled={blockedByExisting}
                placeholder={`Enter correct ${fieldDef.label.toLowerCase()}`}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              />
            </div>
          </div>
        )}

        {/* ── Blocked notice ────────────────────────────────────────────────── */}
        {blockedByExisting && existingForField && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
            A correction for <strong>{existingForField.display_label}</strong>{" "}
            is already{" "}
            <strong>{existingForField.review_status}</strong>. You cannot
            resubmit until it is reviewed or rejected.
          </div>
        )}

        {/* ── Error ─────────────────────────────────────────────────────────── */}
        {error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* ── Disclaimer ────────────────────────────────────────────────────── */}
        <p className="text-xs text-muted-foreground">
          Suggestions are reviewed by our team. Approved corrections update the
          property record. We may contact you for supporting documentation.
        </p>
      </div>
    </Modal>
  );
}
