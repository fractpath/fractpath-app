"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import {
  AddressTypeahead,
  type ResolvedProperty,
} from "@/components/threads/AddressTypeahead";

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

  const safeBase = name.replace(/\.(heic|heif)$/i, "") || "upload";
  return new File([blob], `${safeBase}.jpg`, { type: "image/jpeg" });
}

type DocType = "selfie" | "drivers_license" | "utility_bill";

const DOC_LABELS: Record<DocType, { label: string; hint: string }> = {
  selfie: { label: "Selfie photo", hint: "A clear photo of your face" },
  drivers_license: { label: "Driver license", hint: "Front of your ID" },
  utility_bill: { label: "Utility / bill", hint: "Must show property address" },
};

type Mode = "investor" | "owner";

type EditPrefill = {
  propertyId: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  postal_code: string;
};

type ResolveExtras = {
  normalized_address?: string | null;
  claimed_by_user_id?: string | null;
  property_exists?: boolean | null;
  has_blocking_deal?: boolean | null;
  blocking_reason?: string | null;
};

type ResolvedFull = ResolvedProperty & ResolveExtras;

function statusCopy(r: ResolvedFull) {
  if (r.has_blocking_deal) {
    return {
      tone: "error" as const,
      title: "Unavailable — active agreement in progress",
      body:
        r.blocking_reason ??
        "There is already an active or pending opportunity on this property. A new offer cannot be started until the existing agreement is resolved.",
    };
  }

  if (r.property_status === "verified") {
    return {
      tone: "success" as const,
      title: "Verified — available for offers",
      body: "This home is verified in FractPath and can receive offers. Next step: invite the homeowner to review and accept an offer.",
    };
  }

  if (r.property_exists) {
    if (r.ownership_status === "unclaimed") {
      return {
        tone: "info" as const,
        title: "Unclaimed — homeowner must join/claim/verify",
        body: "This address is already in FractPath, but no homeowner has claimed it yet. To proceed, the homeowner must join, claim the home, and complete verification.",
      };
    }

    if (r.ownership_status === "claimed" && r.property_status !== "verified") {
      return {
        tone: "info" as const,
        title: "Verification pending",
        body: "A homeowner is connected to this address, but verification is not complete. Offers can be drafted, but nothing can be accepted until verification is done.",
      };
    }

    return {
      tone: "info" as const,
      title: "Property found",
      body: "We found this address in FractPath.",
    };
  }

  return {
    tone: "success" as const,
    title: "Added — homeowner must be invited to claim and verify",
    body: "We added this address to FractPath. To accept an offer, the homeowner must join, claim the home, and complete verification. FractPath can help connect both parties.",
  };
}

function Segmented({
  value,
  onChange,
  disabled,
}: {
  value: Mode;
  onChange: (v: Mode) => void;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex rounded-md border bg-white p-1 text-sm">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange("investor")}
        className={`rounded px-3 py-1 ${
          value === "investor" ? "bg-muted font-medium" : "hover:bg-muted/50"
        }`}
      >
        Investor
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange("owner")}
        className={`rounded px-3 py-1 ${
          value === "owner" ? "bg-muted font-medium" : "hover:bg-muted/50"
        }`}
      >
        Owner
      </button>
    </div>
  );
}

export function PropertyForm(props: {
  context: "profile" | "deal";
  onSuccess?: () => void;
  onResolved?: (r: ResolvedFull) => void;
  editPrefill?: EditPrefill | null;
  open: boolean;
  onClose: () => void;
}) {
  const t = useToast();
  const isEdit = !!props.editPrefill;

  const defaultMode: Mode = props.context === "profile" ? "owner" : "investor";
  const [mode, setMode] = useState<Mode>(defaultMode);

  const [resolved, setResolved] = useState<ResolvedFull | null>(null);

  const [address_line1, setLine1] = useState(
    props.editPrefill?.address_line1 ?? "",
  );
  const [address_line2, setLine2] = useState(
    props.editPrefill?.address_line2 ?? "",
  );
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
  const [isResolving, setIsResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  useEffect(() => {
    if (!props.open) return;
    setMode(defaultMode);
    setResolved(null);
    setResolveError(null);
    setIsResolving(false);
    if (!isEdit) {
      setLine1("");
      setLine2("");
      setCity("");
      setState("");
      setZip("");
      setFiles({ selfie: null, drivers_license: null, utility_bill: null });
    }
  }, [props.open, defaultMode, isEdit]);

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

  function setFile(docType: DocType, file: File | null) {
    setFiles((prev) => ({ ...prev, [docType]: file }));
  }

  async function handlePickFile(docType: DocType, raw: File | null) {
    if (!raw) {
      setFile(docType, null);
      return;
    }
    try {
      const normalized = await normalizeUploadToJpeg(raw);
      setFile(docType, normalized);
      const el = fileRefs[docType].current;
      if (el) el.value = "";
    } catch (e) {
      console.error(e);
      t.error("Could not process that image. Try a different file.");
      setFile(docType, null);
    }
  }

  function handleAddressResolved(r: ResolvedProperty) {
    (async () => {
      setIsResolving(true);
      setResolveError(null);
      try {
        const res = await fetch("/api/properties/resolve", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: r.display_address }),
        });
        const data = await res.json();
        if (data?.ok) {
          const merged: ResolvedFull = {
            property_id: data.property_id,
            display_address: data.display_address ?? r.display_address,
            property_status: data.property_status ?? r.property_status ?? null,
            ownership_status:
              data.ownership_status ?? r.ownership_status ?? null,
            normalized_address: data.normalized_address ?? null,
            claimed_by_user_id: data.claimed_by_user_id ?? null,
            property_exists: data.property_exists ?? null,
            has_blocking_deal: data.has_blocking_deal ?? null,
            blocking_reason: data.blocking_reason ?? null,
          };
          setResolved(merged);

          if (data.address_line1) setLine1(data.address_line1);
          if (data.address_line2) setLine2(data.address_line2);
          if (data.city) setCity(data.city);
          if (data.state) setState(data.state);
          if (data.postal_code) setZip(data.postal_code);
        } else {
          setResolved(r as ResolvedFull);
          setResolveError(
            "Couldn\u2019t normalize address yet \u2014 you can still save and fix later.",
          );
        }
      } catch {
        setResolved(r as ResolvedFull);
        setResolveError(
          "Couldn\u2019t normalize address yet \u2014 you can still save and fix later.",
        );
      } finally {
        setIsResolving(false);
      }
    })();
  }

  const isOwnerMode = mode === "owner";
  const allFilesPresent =
    isEdit || !isOwnerMode || Object.values(files).every((f) => f !== null);
  const addressValid =
    !!resolved?.property_id || (isEdit && !!address_line1.trim());
  const canSubmitOwner =
    isOwnerMode &&
    addressValid &&
    allFilesPresent &&
    !submitting &&
    !isResolving;
  const canSubmitInvestor =
    !isOwnerMode &&
    !!resolved?.property_id &&
    !resolved?.has_blocking_deal &&
    !isResolving;

  async function handleSubmitOwner() {
    if (!canSubmitOwner) return;
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.set("address_line1", address_line1.trim());
      fd.set("address_line2", address_line2.trim());
      fd.set("city", city.trim());
      fd.set("state", state.trim());
      fd.set("postal_code", postal_code.trim());

      for (const docType of Object.keys(DOC_LABELS) as DocType[]) {
        if (files[docType]) fd.set(docType, files[docType]!);
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
      if (resolved) {
        props.onResolved?.(resolved);
      }
      props.onClose();
      props.onSuccess?.();
    } catch (e) {
      console.error(e);
      t.error("Something went wrong — try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmitInvestor() {
    if (!canSubmitInvestor || !resolved) return;
    props.onResolved?.(resolved);
    props.onClose();
  }

  const status = resolved ? statusCopy(resolved) : null;
  const headline = isEdit
    ? "Edit property"
    : props.context === "profile"
      ? "Add a property"
      : "Add a property to this deal";

  const description = isEdit
    ? "Update your property details"
    : "Search for an address to get started";

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title={headline}
      description={description}
      primaryLabel={
        isOwnerMode
          ? submitting
            ? "Saving..."
            : isEdit
              ? "Save changes"
              : "Submit for verification"
          : "Add property"
      }
      primaryLoading={isOwnerMode ? submitting : false}
      primaryDisabled={isOwnerMode ? !canSubmitOwner : !canSubmitInvestor}
      onPrimary={isOwnerMode ? handleSubmitOwner : handleSubmitInvestor}
      secondaryLabel="Cancel"
      onSecondary={props.onClose}
    >
      <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
        {isEdit ? (
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
        ) : (
          <div>
            <AddressTypeahead
              onResolved={handleAddressResolved}
              inputTestId={
                props.context === "deal"
                  ? "deal-address-input"
                  : "profile-address-input"
              }
              placeholder="Search street address..."
              showLabel={false}
            />
            {isResolving && (
              <p className="mt-1 text-xs text-muted-foreground animate-pulse">
                Looking up normalized address…
              </p>
            )}
            {resolveError && !isResolving && (
              <p className="mt-1 text-xs text-amber-600">{resolveError}</p>
            )}
          </div>
        )}

        {!isEdit && (
          <div className="flex items-center justify-between gap-3">
            <Segmented value={mode} onChange={setMode} />
            <div className="text-xs text-muted-foreground">
              {mode === "investor" ? "Draft an offer" : "Claim & verify"}
            </div>
          </div>
        )}

        {!isEdit && mode === "investor" && (
          <div className="text-sm text-muted-foreground">
            You&apos;re adding an address to draft an offer.{" "}
            <span className="font-medium text-foreground">
              Nothing is binding until all parties sign a formal agreement.
            </span>{" "}
            To accept an offer, the homeowner must claim the home and complete
            verification. FractPath can help connect both parties.
          </div>
        )}

        {!isEdit && mode === "owner" && !resolved && (
          <div className="text-sm text-muted-foreground">
            You&apos;re adding a home you own. To unlock full features,
            you&apos;ll complete a quick verification step after saving the
            address.
          </div>
        )}

        {status && (
          <div
            className={`rounded-md border p-3 text-sm ${
              status.tone === "success"
                ? "bg-green-50"
                : status.tone === "error"
                  ? "bg-red-50"
                  : "bg-blue-50"
            }`}
          >
            <div className="font-medium">{status.title}</div>
            <div className="mt-1 text-muted-foreground">{status.body}</div>
          </div>
        )}

        {resolved && !isEdit && (
          <div className="text-xs text-muted-foreground">
            Property ID:{" "}
            <span className="font-mono">{resolved.property_id}</span>
          </div>
        )}

        {isOwnerMode && (
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
        )}
      </div>
    </Modal>
  );
}
