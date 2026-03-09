"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

async function normalizeUploadToJpeg(file: File): Promise<File> {
  const name = file.name || "upload";
  const lower = name.toLowerCase();
  const type = (file.type || "").toLowerCase();

  const isHeic =
    type.includes("heic") ||
    type.includes("heif") ||
    lower.endsWith(".heic") ||
    lower.endsWith(".heif");

  if (!isHeic) return file;

  const { default: heic2any } = await import("heic2any");

  const blob = (await heic2any({
    blob: file,
    toType: "image/jpeg",
    quality: 0.9,
  })) as Blob;

  const safeBase = name.replace(/\.(heic|heif)$/i, "");
  return new File([blob], `${safeBase}.jpg`, { type: "image/jpeg" });
}

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

type FilesState = Record<DocType, File | null>;

const EMPTY_FILES: FilesState = {
  selfie: null,
  drivers_license: null,
  utility_bill: null,
};

export function PropertyForm(props: {
  onSuccess?: () => void;
  editPrefill?: EditPrefill | null;
  open: boolean;
  onClose: () => void;
}) {
  const t = useToast();
  const isEdit = !!props.editPrefill;

  const [address_line1, setLine1] = useState("");
  const [address_line2, setLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [postal_code, setZip] = useState("");

  const [files, setFiles] = useState<FilesState>(EMPTY_FILES);
  const [submitting, setSubmitting] = useState(false);

  const fileRefs = {
    selfie: useRef<HTMLInputElement>(null),
    drivers_license: useRef<HTMLInputElement>(null),
    utility_bill: useRef<HTMLInputElement>(null),
  };

  // Reset form each time the modal opens (or edit target changes)
  useEffect(() => {
    if (!props.open) return;

    setLine1(props.editPrefill?.address_line1 ?? "");
    setLine2(props.editPrefill?.address_line2 ?? "");
    setCity(props.editPrefill?.city ?? "");
    setState(props.editPrefill?.state ?? "");
    setZip(props.editPrefill?.postal_code ?? "");
    setFiles(EMPTY_FILES);
    setSubmitting(false);

    // Clear native file inputs so re-selecting same file triggers onChange
    (Object.keys(fileRefs) as DocType[]).forEach((k) => {
      const el = fileRefs[k].current;
      if (el) el.value = "";
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open, props.editPrefill?.propertyId]);

  function setFile(docType: DocType, file: File | null) {
    setFiles((prev) => ({ ...prev, [docType]: file }));
  }

  // Build preview URLs + revoke them when files change/unmount
  const previews = useMemo(() => {
    const out: Partial<Record<DocType, { url: string; isImage: boolean }>> = {};
    (Object.keys(DOC_LABELS) as DocType[]).forEach((k) => {
      const f = files[k];
      if (!f) return;
      const isImage = (f.type || "").toLowerCase().startsWith("image/");
      out[k] = { url: URL.createObjectURL(f), isImage };
    });
    return out;
  }, [files]);

  useEffect(() => {
    return () => {
      (Object.values(previews) as any[]).forEach((p) => {
        if (p?.url) URL.revokeObjectURL(p.url);
      });
    };
  }, [previews]);

  const allFilesPresent =
    isEdit || Object.values(files).every((f) => f !== null);
  const addressValid =
    !!address_line1.trim() && !!state.trim() && !!postal_code.trim();
  const canSubmit = addressValid && allFilesPresent && !submitting;

  async function handlePickFile(docType: DocType, raw: File | null) {
    if (!raw) {
      setFile(docType, null);
      return;
    }

    try {
      // Convert HEIC/HEIF to JPEG so admin preview works everywhere
      const normalized = await normalizeUploadToJpeg(raw);
      setFile(docType, normalized);

      // Clear the input so selecting the same file again still triggers onChange
      const el = fileRefs[docType].current;
      if (el) el.value = "";
    } catch (e) {
      console.error(e);
      t.error("Could not process that image. Try a different file.");
      setFile(docType, null);
    }
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);

    try {
      const fd = new FormData();
      fd.set("address_line1", address_line1.trim());
      fd.set("address_line2", address_line2.trim());
      fd.set("city", city.trim());
      fd.set("state", state.trim().toUpperCase());
      fd.set("postal_code", postal_code.trim());

      (Object.keys(DOC_LABELS) as DocType[]).forEach((docType) => {
        const f = files[docType];
        if (f) fd.set(docType, f);
      });

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
    } catch (e) {
      console.error(e);
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
      description={
        isEdit
          ? "Update your property details"
          : "Submit for verification with address and photos"
      }
      primaryLabel={
        submitting ? "Saving..." : isEdit ? "Save changes" : "Submit"
      }
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
                onChange={(e) => setState(e.target.value.toUpperCase())}
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
              const preview = previews[docType];

              return (
                <div key={docType} className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-medium">{label}</div>
                      <div className="text-xs text-muted-foreground">
                        {hint}
                      </div>
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
                    onChange={(e) =>
                      handlePickFile(docType, e.target.files?.[0] ?? null)
                    }
                  />

                  {file && (
                    <div className="mt-2 flex items-center gap-2">
                      {preview?.isImage ? (
                        <img
                          src={preview.url}
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
