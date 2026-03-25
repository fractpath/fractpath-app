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
  // Sprint 16 intake fields (optional — prefill from saved property data)
  ownership_type?: string | null;
  occupancy_use?: string | null;
  occupancy_use_other?: string | null;
  major_condition_issue?: string | null;
  major_condition_issue_details?: string | null;
  known_liens_and_claims?: string[] | null;
  total_known_debt_amount?: number | null;
  total_known_debt_confidence?: string | null;
  debt_statement_availability?: string | null;
  title_claims_known?: string | null;
  title_claims_details?: string | null;
  owner_stated_fmv?: number | null;
  owner_stated_fmv_confidence?: string | null;
  owner_stated_fmv_source?: string | null;
  owner_stated_fmv_source_other?: string | null;
  willing_to_proceed_formal_review?: string | null;
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

function formatDebtAmount(val: string): string {
  const num = parseFloat(val.replace(/[^0-9.]/g, ""));
  if (isNaN(num)) return val;
  return num.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
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

  // Secured debt declaration state
  const [hasSecuredDebt, setHasSecuredDebt] = useState<boolean | null>(null);
  const [debtAmountStr, setDebtAmountStr] = useState("");
  const [debtFiles, setDebtFiles] = useState<File[]>([]);
  const [debtCertified, setDebtCertified] = useState(false);
  const debtFileInputRef = useRef<HTMLInputElement>(null);

  // Sprint 16 intake fields
  const [ownershipType, setOwnershipType] = useState<string>(
    props.editPrefill?.ownership_type ?? "",
  );
  const [occupancyUse, setOccupancyUse] = useState<string>(
    props.editPrefill?.occupancy_use ?? "",
  );
  const [occupancyUseOther, setOccupancyUseOther] = useState<string>(
    props.editPrefill?.occupancy_use_other ?? "",
  );
  const [majorConditionIssue, setMajorConditionIssue] = useState<string>(
    props.editPrefill?.major_condition_issue ?? "",
  );
  const [majorConditionIssueDetails, setMajorConditionIssueDetails] =
    useState<string>(props.editPrefill?.major_condition_issue_details ?? "");
  const [knownLiensAndClaims, setKnownLiensAndClaims] = useState<string[]>(
    props.editPrefill?.known_liens_and_claims ?? [],
  );
  const [totalKnownDebtAmountStr, setTotalKnownDebtAmountStr] = useState<string>(
    props.editPrefill?.total_known_debt_amount != null
      ? String(props.editPrefill.total_known_debt_amount)
      : "",
  );
  const [totalKnownDebtConfidence, setTotalKnownDebtConfidence] =
    useState<string>(props.editPrefill?.total_known_debt_confidence ?? "");
  const [debtStatementAvailability, setDebtStatementAvailability] =
    useState<string>(props.editPrefill?.debt_statement_availability ?? "");
  const [titleClaimsKnown, setTitleClaimsKnown] = useState<string>(
    props.editPrefill?.title_claims_known ?? "",
  );
  const [titleClaimsDetails, setTitleClaimsDetails] = useState<string>(
    props.editPrefill?.title_claims_details ?? "",
  );
  const [ownerStatedFmvStr, setOwnerStatedFmvStr] = useState<string>(
    props.editPrefill?.owner_stated_fmv != null
      ? String(props.editPrefill.owner_stated_fmv)
      : "",
  );
  const [ownerStatedFmvConfidence, setOwnerStatedFmvConfidence] =
    useState<string>(props.editPrefill?.owner_stated_fmv_confidence ?? "");
  const [ownerStatedFmvSource, setOwnerStatedFmvSource] = useState<string>(
    props.editPrefill?.owner_stated_fmv_source ?? "",
  );
  const [ownerStatedFmvSourceOther, setOwnerStatedFmvSourceOther] =
    useState<string>(props.editPrefill?.owner_stated_fmv_source_other ?? "");
  const [willingToProceed, setWillingToProceed] = useState<string>(
    props.editPrefill?.willing_to_proceed_formal_review ?? "",
  );

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!props.open) return;
    setMode(defaultMode);
    setResolved(null);
    if (!isEdit) {
      setLine1("");
      setLine2("");
      setCity("");
      setState("");
      setZip("");
      setFiles({ selfie: null, drivers_license: null, utility_bill: null });
    }
    setHasSecuredDebt(null);
    setDebtAmountStr("");
    setDebtFiles([]);
    setDebtCertified(false);
    // Sprint 16 intake — prefill from saved data in edit mode, reset in create mode
    const p = props.editPrefill;
    setOwnershipType(p?.ownership_type ?? "");
    setOccupancyUse(p?.occupancy_use ?? "");
    setOccupancyUseOther(p?.occupancy_use_other ?? "");
    setMajorConditionIssue(p?.major_condition_issue ?? "");
    setMajorConditionIssueDetails(p?.major_condition_issue_details ?? "");
    setKnownLiensAndClaims(p?.known_liens_and_claims ?? []);
    setTotalKnownDebtAmountStr(
      p?.total_known_debt_amount != null ? String(p.total_known_debt_amount) : "",
    );
    setTotalKnownDebtConfidence(p?.total_known_debt_confidence ?? "");
    setDebtStatementAvailability(p?.debt_statement_availability ?? "");
    setTitleClaimsKnown(p?.title_claims_known ?? "");
    setTitleClaimsDetails(p?.title_claims_details ?? "");
    setOwnerStatedFmvStr(
      p?.owner_stated_fmv != null ? String(p.owner_stated_fmv) : "",
    );
    setOwnerStatedFmvConfidence(p?.owner_stated_fmv_confidence ?? "");
    setOwnerStatedFmvSource(p?.owner_stated_fmv_source ?? "");
    setOwnerStatedFmvSourceOther(p?.owner_stated_fmv_source_other ?? "");
    setWillingToProceed(p?.willing_to_proceed_formal_review ?? "");
  }, [props.open, defaultMode, isEdit, props.editPrefill]);

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

  async function handlePickDebtFile(raw: File | null) {
    if (!raw) return;
    try {
      const normalized = await normalizeUploadToJpeg(raw);
      setDebtFiles((prev) => [...prev, normalized]);
      if (debtFileInputRef.current) debtFileInputRef.current.value = "";
    } catch (e) {
      console.error(e);
      t.error("Could not process that file. Try a different file.");
    }
  }

  function removeDebtFile(idx: number) {
    setDebtFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleAddressResolved(r: ResolvedProperty) {
    const merged: ResolvedFull = {
      property_id: r.property_id,
      display_address: r.display_address,
      property_status: r.property_status ?? null,
      ownership_status: r.ownership_status ?? null,
      normalized_address: r.normalized_address ?? null,
      claimed_by_user_id: r.claimed_by_user_id ?? null,
      property_exists: r.property_exists ?? null,
      has_blocking_deal: r.has_blocking_deal ?? null,
      blocking_reason: r.blocking_reason ?? null,
    };
    setResolved(merged);

    setLine1(r.address_line1 ?? "");
    setLine2(r.address_line2 ?? "");
    setCity(r.city ?? "");
    setState(r.state ?? "");
    setZip(r.postal_code ?? "");
  }

  const isOwnerMode = mode === "owner";
  const allFilesPresent =
    isEdit || !isOwnerMode || Object.values(files).every((f) => f !== null);
  const addressValid =
    !!resolved?.property_id || (isEdit && !!address_line1.trim());
  const structuredReady = !!address_line1.trim() && !!state.trim();

  // Debt section validation
  const debtDeclared = isEdit || hasSecuredDebt !== null;
  const debtAmountNum = parseFloat(debtAmountStr.replace(/[^0-9.]/g, ""));
  const debtValid =
    isEdit ||
    hasSecuredDebt === false ||
    (hasSecuredDebt === true &&
      !isNaN(debtAmountNum) &&
      debtAmountNum > 0 &&
      debtFiles.length > 0 &&
      debtCertified);

  // Sprint 16 intake validation — only required in create mode
  const intakeValid =
    isEdit ||
    (ownershipType !== "" &&
      occupancyUse !== "" &&
      (occupancyUse !== "other" || occupancyUseOther.trim() !== "") &&
      majorConditionIssue !== "" &&
      (majorConditionIssue !== "yes" ||
        majorConditionIssueDetails.trim() !== "") &&
      knownLiensAndClaims.length > 0 &&
      titleClaimsKnown !== "" &&
      (titleClaimsKnown !== "yes" || titleClaimsDetails.trim() !== "") &&
      ownerStatedFmvStr.trim() !== "" &&
      ownerStatedFmvConfidence !== "" &&
      ownerStatedFmvSource !== "" &&
      (ownerStatedFmvSource !== "other" ||
        ownerStatedFmvSourceOther.trim() !== "") &&
      willingToProceed !== "");

  const canSubmitOwner =
    isOwnerMode &&
    addressValid &&
    structuredReady &&
    allFilesPresent &&
    debtDeclared &&
    debtValid &&
    intakeValid &&
    !submitting;
  const canSubmitInvestor =
    !isOwnerMode &&
    !!resolved?.property_id &&
    !resolved?.has_blocking_deal;

  async function handleSubmitOwner() {
    if (!canSubmitOwner) return;
    setSubmitting(true);
    try {
      if (isEdit) {
        const metadataFd = new FormData();
        metadataFd.set("address_line1", address_line1.trim());
        metadataFd.set("address_line2", address_line2.trim());
        metadataFd.set("city", city.trim());
        metadataFd.set("state", state.trim());
        metadataFd.set("postal_code", postal_code.trim());

        // Include debt declaration if it was updated during edit
        if (hasSecuredDebt !== null) {
          metadataFd.set("has_secured_debt", hasSecuredDebt ? "true" : "false");
          if (hasSecuredDebt && debtAmountStr.trim()) {
            metadataFd.set(
              "secured_debt_amount",
              String(debtAmountNum > 0 ? debtAmountNum : 0),
            );
          }
          if (hasSecuredDebt && debtCertified) {
            metadataFd.set("secured_debt_certified", "true");
          }
        }

        // Sprint 16 intake fields (optional during edit — only send if set)
        if (ownershipType) metadataFd.set("ownership_type", ownershipType);
        if (occupancyUse) metadataFd.set("occupancy_use", occupancyUse);
        if (occupancyUseOther) metadataFd.set("occupancy_use_other", occupancyUseOther);
        if (majorConditionIssue) metadataFd.set("major_condition_issue", majorConditionIssue);
        if (majorConditionIssueDetails)
          metadataFd.set("major_condition_issue_details", majorConditionIssueDetails);
        for (const v of knownLiensAndClaims)
          metadataFd.append("known_liens_and_claims", v);
        if (totalKnownDebtAmountStr.trim())
          metadataFd.set("total_known_debt_amount", totalKnownDebtAmountStr.trim());
        if (totalKnownDebtConfidence)
          metadataFd.set("total_known_debt_confidence", totalKnownDebtConfidence);
        if (debtStatementAvailability)
          metadataFd.set("debt_statement_availability", debtStatementAvailability);
        if (titleClaimsKnown) metadataFd.set("title_claims_known", titleClaimsKnown);
        if (titleClaimsDetails) metadataFd.set("title_claims_details", titleClaimsDetails);
        if (ownerStatedFmvStr.trim())
          metadataFd.set("owner_stated_fmv", ownerStatedFmvStr.trim());
        if (ownerStatedFmvConfidence)
          metadataFd.set("owner_stated_fmv_confidence", ownerStatedFmvConfidence);
        if (ownerStatedFmvSource)
          metadataFd.set("owner_stated_fmv_source", ownerStatedFmvSource);
        if (ownerStatedFmvSourceOther)
          metadataFd.set("owner_stated_fmv_source_other", ownerStatedFmvSourceOther);
        if (willingToProceed)
          metadataFd.set("willing_to_proceed_formal_review", willingToProceed);

        const editUrl = `/api/me/properties/${props.editPrefill!.propertyId}/edit`;
        const metaRes = await fetch(editUrl, { method: "PATCH", body: metadataFd });
        const metaJson = await metaRes.json().catch(() => null);

        if (!metaRes.ok) {
          t.error(metaJson?.error || "Something went wrong — try again.");
          return;
        }

        const docsToUpload = (Object.keys(DOC_LABELS) as DocType[]).filter(
          (k) => files[k] !== null,
        );
        for (const docType of docsToUpload) {
          const docFd = new FormData();
          docFd.set("address_line1", address_line1.trim());
          docFd.set("address_line2", address_line2.trim());
          docFd.set("city", city.trim());
          docFd.set("state", state.trim());
          docFd.set("postal_code", postal_code.trim());
          docFd.set(docType, files[docType]!);

          const docRes = await fetch(editUrl, { method: "PATCH", body: docFd });
          const docJson = await docRes.json().catch(() => null);
          if (!docRes.ok) {
            t.error(
              docJson?.error ||
                `Failed to upload ${docType.replace("_", " ")} — try again.`,
            );
            return;
          }
        }

        // Upload any new debt statement files during edit
        for (const debtFile of debtFiles) {
          const debtFd = new FormData();
          debtFd.set("address_line1", address_line1.trim());
          debtFd.set("address_line2", address_line2.trim());
          debtFd.set("city", city.trim());
          debtFd.set("state", state.trim());
          debtFd.set("postal_code", postal_code.trim());
          debtFd.set("secured_debt_statement", debtFile);

          const debtRes = await fetch(editUrl, { method: "PATCH", body: debtFd });
          const debtJson = await debtRes.json().catch(() => null);
          if (!debtRes.ok) {
            t.error(debtJson?.error || "Failed to upload loan statement — try again.");
            return;
          }
        }
      } else {
        const fd = new FormData();
        fd.set("address_line1", address_line1.trim());
        fd.set("address_line2", address_line2.trim());
        fd.set("city", city.trim());
        fd.set("state", state.trim());
        fd.set("postal_code", postal_code.trim());

        for (const docType of Object.keys(DOC_LABELS) as DocType[]) {
          if (files[docType]) fd.set(docType, files[docType]!);
        }

        if (hasSecuredDebt !== null) {
          fd.set("has_secured_debt", hasSecuredDebt ? "true" : "false");
        }
        if (hasSecuredDebt === true) {
          fd.set("secured_debt_amount", String(debtAmountNum > 0 ? debtAmountNum : 0));
          for (const debtFile of debtFiles) {
            fd.append("secured_debt_statement", debtFile);
          }
          if (debtCertified) {
            fd.set("secured_debt_certified", "true");
          }
        }

        // Sprint 16 intake fields
        if (ownershipType) fd.set("ownership_type", ownershipType);
        if (occupancyUse) fd.set("occupancy_use", occupancyUse);
        if (occupancyUseOther) fd.set("occupancy_use_other", occupancyUseOther);
        if (majorConditionIssue) fd.set("major_condition_issue", majorConditionIssue);
        if (majorConditionIssueDetails)
          fd.set("major_condition_issue_details", majorConditionIssueDetails);
        for (const v of knownLiensAndClaims) fd.append("known_liens_and_claims", v);
        if (totalKnownDebtAmountStr.trim())
          fd.set("total_known_debt_amount", totalKnownDebtAmountStr.trim());
        if (totalKnownDebtConfidence)
          fd.set("total_known_debt_confidence", totalKnownDebtConfidence);
        if (debtStatementAvailability)
          fd.set("debt_statement_availability", debtStatementAvailability);
        if (titleClaimsKnown) fd.set("title_claims_known", titleClaimsKnown);
        if (titleClaimsDetails) fd.set("title_claims_details", titleClaimsDetails);
        if (ownerStatedFmvStr.trim())
          fd.set("owner_stated_fmv", ownerStatedFmvStr.trim());
        if (ownerStatedFmvConfidence)
          fd.set("owner_stated_fmv_confidence", ownerStatedFmvConfidence);
        if (ownerStatedFmvSource) fd.set("owner_stated_fmv_source", ownerStatedFmvSource);
        if (ownerStatedFmvSourceOther)
          fd.set("owner_stated_fmv_source_other", ownerStatedFmvSourceOther);
        if (willingToProceed)
          fd.set("willing_to_proceed_formal_review", willingToProceed);

        const res = await fetch("/api/me/properties", { method: "POST", body: fd });
        const json = await res.json().catch(() => null);

        if (!res.ok) {
          t.error(json?.error || "Something went wrong — try again.");
          return;
        }
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
            {!resolved && address_line1 === "" && state === "" && (
              <p className="mt-1 text-xs text-muted-foreground">
                Select an address from the suggestions above.
              </p>
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

        {/* Secured debt declaration — owner mode only */}
        {isOwnerMode && (
          <div className="border-t pt-4 space-y-3">
            <div>
              <div className="text-sm font-medium">
                Loans secured by this property {isEdit ? "(optional update)" : "*"}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                This information is kept private and used only for verification
                purposes. It will never be shared with prospective buyers.
              </div>
            </div>

            <div className="text-sm font-medium">
              Do you currently owe money on any loans secured by this property?
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setHasSecuredDebt(false);
                  setDebtAmountStr("");
                  setDebtFiles([]);
                  setDebtCertified(false);
                }}
                className={`px-4 py-2 rounded-md border text-sm font-medium transition-colors ${
                  hasSecuredDebt === false
                    ? "bg-foreground text-background border-foreground"
                    : "bg-white hover:bg-muted/40"
                }`}
              >
                No
              </button>
              <button
                type="button"
                onClick={() => setHasSecuredDebt(true)}
                className={`px-4 py-2 rounded-md border text-sm font-medium transition-colors ${
                  hasSecuredDebt === true
                    ? "bg-foreground text-background border-foreground"
                    : "bg-white hover:bg-muted/40"
                }`}
              >
                Yes
              </button>
            </div>

            {hasSecuredDebt === false && (
              <div className="rounded-md bg-muted/40 border p-3 text-sm text-muted-foreground">
                You&apos;ve indicated this property has no outstanding secured
                loans. Your answer will be reviewed as part of the verification
                process.
              </div>
            )}

            {/* Sprint 16 intake section — owner mode only */}
            {isOwnerMode && (
              <div className="border-t pt-4 space-y-5">
                <div>
                  <div className="text-sm font-medium">
                    Additional property details{" "}
                    {isEdit ? "(optional update)" : "*"}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    This information is kept private and used only for internal
                    review. It will never be shared with prospective buyers.
                  </div>
                </div>

                {/* Ownership type */}
                <div className="space-y-1.5">
                  <div className="text-sm font-medium">
                    How is ownership of this property held?
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: "sole_owner", label: "Sole owner" },
                      { value: "co_owner", label: "Co-owner" },
                      { value: "trust", label: "Trust" },
                      { value: "estate", label: "Estate" },
                      { value: "not_sure", label: "Not sure" },
                    ].map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setOwnershipType(value)}
                        className={`px-3 py-1.5 rounded-md border text-sm transition-colors ${
                          ownershipType === value
                            ? "bg-foreground text-background border-foreground"
                            : "bg-white hover:bg-muted/40"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Occupancy use */}
                <div className="space-y-1.5">
                  <div className="text-sm font-medium">
                    How is this property currently used?
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: "primary", label: "Primary residence" },
                      { value: "rental", label: "Rental / investment" },
                      { value: "vacant", label: "Vacant" },
                      { value: "second_home", label: "Second home" },
                      { value: "other", label: "Other" },
                    ].map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => {
                          setOccupancyUse(value);
                          if (value !== "other") setOccupancyUseOther("");
                        }}
                        className={`px-3 py-1.5 rounded-md border text-sm transition-colors ${
                          occupancyUse === value
                            ? "bg-foreground text-background border-foreground"
                            : "bg-white hover:bg-muted/40"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {occupancyUse === "other" && (
                    <input
                      type="text"
                      className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                      placeholder="Please describe…"
                      value={occupancyUseOther}
                      onChange={(e) => setOccupancyUseOther(e.target.value)}
                    />
                  )}
                </div>

                {/* Major condition issues */}
                <div className="space-y-1.5">
                  <div className="text-sm font-medium">
                    Are you aware of any major structural or condition issues
                    affecting this property?
                  </div>
                  <div className="flex gap-2">
                    {[
                      { value: "no", label: "No" },
                      { value: "yes", label: "Yes" },
                      { value: "not_sure", label: "Not sure" },
                    ].map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => {
                          setMajorConditionIssue(value);
                          if (value !== "yes")
                            setMajorConditionIssueDetails("");
                        }}
                        className={`px-4 py-2 rounded-md border text-sm font-medium transition-colors ${
                          majorConditionIssue === value
                            ? "bg-foreground text-background border-foreground"
                            : "bg-white hover:bg-muted/40"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {majorConditionIssue === "yes" && (
                    <textarea
                      className="mt-1 w-full rounded-md border px-3 py-2 text-sm resize-none"
                      rows={2}
                      placeholder="Briefly describe the issue(s)…"
                      value={majorConditionIssueDetails}
                      onChange={(e) =>
                        setMajorConditionIssueDetails(e.target.value)
                      }
                    />
                  )}
                </div>

                {/* Known liens and claims */}
                <div className="space-y-1.5">
                  <div className="text-sm font-medium">
                    Which of the following apply to this property? (Select all
                    that apply)
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: "first_mortgage", label: "First mortgage" },
                      { value: "heloc", label: "HELOC" },
                      { value: "second_lien", label: "Second lien" },
                      { value: "tax_lien", label: "Tax lien" },
                      { value: "judgment", label: "Judgment" },
                      { value: "hoa_lien", label: "HOA lien" },
                      { value: "other_claim", label: "Other claim" },
                      { value: "none_known", label: "None known" },
                      { value: "not_sure", label: "Not sure" },
                    ].map(({ value, label }) => {
                      const selected = knownLiensAndClaims.includes(value);
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => {
                            setKnownLiensAndClaims((prev) => {
                              if (
                                value === "none_known" ||
                                value === "not_sure"
                              ) {
                                return selected ? [] : [value];
                              }
                              const without = prev.filter(
                                (v) =>
                                  v !== "none_known" &&
                                  v !== "not_sure" &&
                                  v !== value,
                              );
                              return selected
                                ? without
                                : [...without, value];
                            });
                          }}
                          className={`px-3 py-1.5 rounded-md border text-sm transition-colors ${
                            selected
                              ? "bg-foreground text-background border-foreground"
                              : "bg-white hover:bg-muted/40"
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Debt detail fields — shown when any real lien type selected */}
                  {knownLiensAndClaims.some(
                    (v) => v !== "none_known" && v !== "not_sure",
                  ) && (
                    <div className="space-y-3 mt-2 pl-1 border-l-2 border-muted">
                      <label className="block space-y-1">
                        <span className="text-sm font-medium">
                          Estimated total balance across all liens
                        </span>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                            $
                          </span>
                          <input
                            type="text"
                            inputMode="decimal"
                            className="w-full rounded-md border pl-7 pr-3 py-2 text-sm"
                            placeholder="0"
                            value={totalKnownDebtAmountStr}
                            onChange={(e) =>
                              setTotalKnownDebtAmountStr(e.target.value)
                            }
                          />
                        </div>
                      </label>

                      <div className="space-y-1.5">
                        <div className="text-sm font-medium">
                          How confident are you in that estimate?
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          {[
                            { value: "exact", label: "Exact" },
                            { value: "estimate", label: "Estimate" },
                            { value: "not_sure", label: "Not sure" },
                          ].map(({ value, label }) => (
                            <button
                              key={value}
                              type="button"
                              onClick={() =>
                                setTotalKnownDebtConfidence(value)
                              }
                              className={`px-3 py-1.5 rounded-md border text-sm transition-colors ${
                                totalKnownDebtConfidence === value
                                  ? "bg-foreground text-background border-foreground"
                                  : "bg-white hover:bg-muted/40"
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <div className="text-sm font-medium">
                          Do you have loan statements available?
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          {[
                            { value: "yes", label: "Yes" },
                            { value: "partially", label: "Partially" },
                            { value: "no", label: "No" },
                          ].map(({ value, label }) => (
                            <button
                              key={value}
                              type="button"
                              onClick={() =>
                                setDebtStatementAvailability(value)
                              }
                              className={`px-3 py-1.5 rounded-md border text-sm transition-colors ${
                                debtStatementAvailability === value
                                  ? "bg-foreground text-background border-foreground"
                                  : "bg-white hover:bg-muted/40"
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Title claims */}
                <div className="space-y-1.5">
                  <div className="text-sm font-medium">
                    Are you aware of any title disputes, claims, or ownership
                    challenges on this property?
                  </div>
                  <div className="flex gap-2">
                    {[
                      { value: "no", label: "No" },
                      { value: "yes", label: "Yes" },
                      { value: "not_sure", label: "Not sure" },
                    ].map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => {
                          setTitleClaimsKnown(value);
                          if (value !== "yes") setTitleClaimsDetails("");
                        }}
                        className={`px-4 py-2 rounded-md border text-sm font-medium transition-colors ${
                          titleClaimsKnown === value
                            ? "bg-foreground text-background border-foreground"
                            : "bg-white hover:bg-muted/40"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {titleClaimsKnown === "yes" && (
                    <textarea
                      className="mt-1 w-full rounded-md border px-3 py-2 text-sm resize-none"
                      rows={2}
                      placeholder="Briefly describe…"
                      value={titleClaimsDetails}
                      onChange={(e) => setTitleClaimsDetails(e.target.value)}
                    />
                  )}
                </div>

                {/* Owner-stated FMV */}
                <div className="space-y-3">
                  <label className="block space-y-1">
                    <span className="text-sm font-medium">
                      What do you believe this property is worth today?
                    </span>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                        $
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        className="w-full rounded-md border pl-7 pr-3 py-2 text-sm"
                        placeholder="0"
                        value={ownerStatedFmvStr}
                        onChange={(e) => setOwnerStatedFmvStr(e.target.value)}
                      />
                    </div>
                  </label>

                  <div className="space-y-1.5">
                    <div className="text-sm font-medium">
                      How confident are you in that estimate?
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {[
                        { value: "very_confident", label: "Very confident" },
                        { value: "somewhat", label: "Somewhat confident" },
                        { value: "low", label: "Low confidence" },
                        { value: "not_sure", label: "Not sure" },
                      ].map(({ value, label }) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setOwnerStatedFmvConfidence(value)}
                          className={`px-3 py-1.5 rounded-md border text-sm transition-colors ${
                            ownerStatedFmvConfidence === value
                              ? "bg-foreground text-background border-foreground"
                              : "bg-white hover:bg-muted/40"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="text-sm font-medium">
                      What is your primary basis for this estimate?
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {[
                        { value: "appraisal", label: "Recent appraisal" },
                        { value: "realtor_cma", label: "Realtor / CMA" },
                        { value: "online", label: "Online estimate" },
                        {
                          value: "personal",
                          label: "Personal assessment",
                        },
                        {
                          value: "offer_listing",
                          label: "Offer / listing price",
                        },
                        { value: "other", label: "Other" },
                      ].map(({ value, label }) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => {
                            setOwnerStatedFmvSource(value);
                            if (value !== "other")
                              setOwnerStatedFmvSourceOther("");
                          }}
                          className={`px-3 py-1.5 rounded-md border text-sm transition-colors ${
                            ownerStatedFmvSource === value
                              ? "bg-foreground text-background border-foreground"
                              : "bg-white hover:bg-muted/40"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {ownerStatedFmvSource === "other" && (
                      <input
                        type="text"
                        className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                        placeholder="Please describe…"
                        value={ownerStatedFmvSourceOther}
                        onChange={(e) =>
                          setOwnerStatedFmvSourceOther(e.target.value)
                        }
                      />
                    )}
                  </div>
                </div>

                {/* Willing to proceed */}
                <div className="space-y-1.5">
                  <div className="text-sm font-medium">
                    Are you open to moving forward with a formal review of your
                    options?
                  </div>
                  <div className="flex gap-2">
                    {[
                      { value: "yes", label: "Yes" },
                      { value: "maybe", label: "Maybe" },
                      { value: "no", label: "Not right now" },
                    ].map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setWillingToProceed(value)}
                        className={`px-4 py-2 rounded-md border text-sm font-medium transition-colors ${
                          willingToProceed === value
                            ? "bg-foreground text-background border-foreground"
                            : "bg-white hover:bg-muted/40"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {hasSecuredDebt === true && (
              <div className="space-y-3">
                <label className="block space-y-1">
                  <span className="text-sm font-medium">
                    Total amount currently owed *
                  </span>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      $
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      className="w-full rounded-md border pl-7 pr-3 py-2 text-sm"
                      placeholder="0"
                      value={debtAmountStr}
                      onChange={(e) => setDebtAmountStr(e.target.value)}
                      onBlur={(e) => {
                        const num = parseFloat(
                          e.target.value.replace(/[^0-9.]/g, ""),
                        );
                        if (!isNaN(num)) setDebtAmountStr(formatDebtAmount(String(num)));
                      }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Include all mortgages, HELOCs, and other liens. Enter the
                    combined outstanding principal balance.
                  </p>
                </label>

                <div>
                  <div className="text-sm font-medium mb-1">
                    Loan statement(s) *
                  </div>
                  <div className="text-xs text-muted-foreground mb-2">
                    Upload your most recent statement for each loan (mortgage,
                    HELOC, etc.). Multiple files are accepted.
                  </div>

                  <input
                    ref={debtFileInputRef}
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={(e) =>
                      handlePickDebtFile(e.target.files?.[0] ?? null)
                    }
                  />

                  <div className="space-y-2">
                    {debtFiles.map((f, idx) => {
                      const isImage = f.type.startsWith("image/");
                      const previewUrl = URL.createObjectURL(f);
                      return (
                        <div
                          key={idx}
                          className="flex items-center gap-2 rounded-md border p-2"
                        >
                          {isImage ? (
                            <img
                              src={previewUrl}
                              alt={f.name}
                              className="h-10 w-10 rounded object-cover border shrink-0"
                              onLoad={() => URL.revokeObjectURL(previewUrl)}
                            />
                          ) : (
                            <div className="h-10 w-10 rounded border flex items-center justify-center bg-muted text-xs shrink-0">
                              PDF
                            </div>
                          )}
                          <span className="text-xs text-muted-foreground truncate flex-1">
                            {f.name}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeDebtFile(idx)}
                            className="text-xs text-muted-foreground hover:text-foreground shrink-0 px-2"
                          >
                            Remove
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    className="mt-2 text-sm px-3 py-1.5 rounded-md border hover:bg-muted/40 transition-colors"
                    onClick={() => debtFileInputRef.current?.click()}
                  >
                    + Add statement
                  </button>
                </div>

                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-0.5 shrink-0"
                    checked={debtCertified}
                    onChange={(e) => setDebtCertified(e.target.checked)}
                  />
                  <span className="text-xs text-muted-foreground">
                    I certify that the loan information I have provided is
                    accurate and complete to the best of my knowledge. I
                    understand this information will be reviewed by FractPath
                    for verification purposes only.
                  </span>
                </label>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
