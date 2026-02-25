"use client";

import { useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

type DocType = "selfie" | "drivers_license" | "utility_bill";

const DOC_LABELS: Record<DocType, { label: string; hint: string }> = {
  selfie: { label: "Selfie photo", hint: "A clear photo of your face" },
  drivers_license: { label: "Driver license", hint: "Front of your ID" },
  utility_bill: { label: "Utility / bill", hint: "Must show property address" },
};

type EditPrefill = {
  propertyId: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  postal_code: string;
};

export function PropertyForm(props: {
  onSuccess?: () => void;
  editPrefill?: EditPrefill | null;
  open: boolean;
  onClose: () => void;
}) {
  const t = useToast();
  const isEdit = !!props.editPrefill;
  const [address_line1, setLine1] = useState(props.editPrefill?.address_line1 ?? "");
  const [address_line2, setLine2] = useState(props.editPrefill?.address_line2 ?? "");
  const [city, setCity] = useState(props.editPrefill?.city ?? "");
  const [state, setState] = useState(props.editPrefill?.state ?? "");
  const [postal_code, setZip] = useState(props.editPrefill?.postal_code ?? "");

  const [files, setFiles] = useState<Record<DocType, File | null>>({
    selfie: null,
    drivers_license: null,
    utility_bill: null,
  });

  const fileRefs = {
    selfie: useRef<HTMLInputElement>(null),
    drivers_license: useRef<HTMLInputElement>(null),
    utility_bill: useRef<HTMLInputElement>(null),
  };

  const [submitting, setSubmitting] = useState(false);

  function setFile(docType: DocType, file: File | null) {
    setFiles((prev) => ({ ...prev, [docType]: file }));
  }

  const allFilesPresent = isEdit || Object.values(files).every((f) => f !== null);
  const addressValid = address_line1.trim() && state.trim() && postal_code.trim();
  const canSubmit = addressValid && allFilesPresent && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.set("address_line1", address_line1.trim());
      fd.set("address_line2", address_line2.trim());
      fd.set("city", city.trim());
      fd.set("state", state.trim());
      fd.set("postal_code", postal_code.trim());

      for (const docType of Object.keys(DOC_LABELS) as DocType[]) {
        if (files[docType]) {
          fd.set(docType, files[docType]!);
        }
      }

      const url = isEdit
        ? `/api/me/properties/${props.editPrefill!.propertyId}/edit`
        : "/api/me/properties";
      const method = isEdit ? "PATCH" : "POST";

      const res = await fetch(url, { method, body: fd });
      const json = await res.json().catch(() => null);

      if (!res.ok) {
        t.error(json?.error || "Something went wrong — try again.");
        return;
      }

      t.success(isEdit ? "Property updated." : "Submitted for verification.");
      props.onClose();
      props.onSuccess?.();
    } catch {
      t.error("Something went wrong — try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title={isEdit ? "Edit property" : "Add property"}
      description={isEdit ? "Update your property details" : "Submit for verification with address and photos"}
      primaryLabel={submitting ? "Saving..." : isEdit ? "Save changes" : "Submit"}
      primaryLoading={submitting}
      primaryDisabled={!canSubmit}
      onPrimary={handleSubmit}
      secondaryLabel="Cancel"
      onSecondary={props.onClose}
    >
      <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-sm font-medium">Street address *</span>
            <input
              className="w-full rounded-md border px-3 py-2 text-sm"
              value={address_line1}
              onChange={(e) => setLine1(e.target.value)}
              placeholder="123 Main St"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Address line 2</span>
            <input
              className="w-full rounded-md border px-3 py-2 text-sm"
              value={address_line2}
              onChange={(e) => setLine2(e.target.value)}
              placeholder="Apt, Suite, etc."
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">City</span>
            <input
              className="w-full rounded-md border px-3 py-2 text-sm"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="City"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-sm font-medium">State *</span>
              <input
                className="w-full rounded-md border px-3 py-2 text-sm"
                value={state}
                onChange={(e) => setState(e.target.value)}
                placeholder="CA"
                maxLength={2}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">Zip code *</span>
              <input
                className="w-full rounded-md border px-3 py-2 text-sm"
                value={postal_code}
                onChange={(e) => setZip(e.target.value)}
                placeholder="90210"
                maxLength={10}
              />
            </label>
          </div>
        </div>

        <div className="border-t pt-4">
          <div className="text-sm font-medium mb-1">
            Verification documents {isEdit ? "(optional re-upload)" : "*"}
          </div>
          <div className="text-xs text-muted-foreground mb-3">
            Upload clear photos for each category.
          </div>
          <div className="space-y-3">
            {(Object.keys(DOC_LABELS) as DocType[]).map((docType) => {
              const { label, hint } = DOC_LABELS[docType];
              const file = files[docType];
              return (
                <div key={docType} className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-medium">{label}</div>
                      <div className="text-xs text-muted-foreground">{hint}</div>
                    </div>
                    <button
                      type="button"
                      className="shrink-0 text-xs px-3 py-1 rounded border hover:bg-muted"
                      onClick={() => fileRefs[docType].current?.click()}
                    >
                      {file ? "Replace" : "Choose file"}
                    </button>
                  </div>
                  <input
                    ref={fileRefs[docType]}
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={(e) => setFile(docType, e.target.files?.[0] ?? null)}
                  />
                  {file && (
                    <div className="mt-2 flex items-center gap-2">
                      {file.type.startsWith("image/") ? (
                        <img
                          src={URL.createObjectURL(file)}
                          alt={label}
                          className="h-12 w-12 rounded object-cover border"
                        />
                      ) : (
                        <div className="h-12 w-12 rounded border flex items-center justify-center bg-muted text-xs">
                          PDF
                        </div>
                      )}
                      <span className="text-xs text-muted-foreground truncate">
                        {file.name}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Modal>
  );
}
