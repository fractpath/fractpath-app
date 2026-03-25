"use client";

import { useEffect, useState } from "react";

type Doc = {
  id: string;
  doc_type: string;
  storage_path: string;
  content_type: string;
  created_at: string;
  signed_url: string | null;
};

type Props = {
  propertyId: string;
  onOpenEdit: () => void;
  editAllowed: boolean;
};

const VERIFICATION_DOC_TYPES = [
  { type: "selfie", label: "Selfie photo" },
  { type: "drivers_license", label: "Driver's license" },
  { type: "utility_bill", label: "Utility bill" },
] as const;

const SUPPORTING_DOC_LABELS: Record<string, string> = {
  secured_debt_statement: "Debt statement",
  mortgage_statement: "Mortgage statement",
  heloc_statement: "HELOC statement",
  second_lien_statement: "Second lien statement",
  tax_lien_notice: "Tax lien notice",
  judgment_document: "Judgment document",
  hoa_lien_notice: "HOA lien notice",
  other_claim_document: "Other claim document",
  appraisal_report: "Appraisal report",
  cma_report: "CMA / realtor estimate",
  online_estimate_screenshot: "Online estimate screenshot",
  listing_or_offer_document: "Listing or offer document",
  trust_document: "Trust document",
  estate_document: "Estate document",
  condition_supporting_document: "Condition supporting document",
};

function docLabel(docType: string): string {
  const v = VERIFICATION_DOC_TYPES.find((d) => d.type === docType);
  if (v) return v.label;
  return SUPPORTING_DOC_LABELS[docType] ?? docType.replace(/_/g, " ");
}

export function PropertyDocumentsPanel({
  propertyId,
  onOpenEdit,
  editAllowed,
}: Props) {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/me/properties/${propertyId}/documents`, {
      credentials: "include",
    })
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return;
        if (body?.ok && Array.isArray(body.documents)) {
          setDocs(body.documents);
        } else {
          setErr(body?.error ?? "Failed to load documents");
        }
      })
      .catch(() => {
        if (!cancelled) setErr("Network error loading documents");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  const byType = new Map<string, Doc>();
  for (const d of docs ?? []) {
    byType.set(d.doc_type, d);
  }

  // Supporting docs: anything not in the three verification types
  const verificationTypes = new Set(VERIFICATION_DOC_TYPES.map((d) => d.type));
  const supportingDocs = (docs ?? []).filter(
    (d) => !verificationTypes.has(d.doc_type as any),
  );

  return (
    <div className="rounded-lg border p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold">Property documents</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          These documents help verify your property and support review requests.
          You can replace outdated files at any time.
        </p>
      </div>

      {loading && (
        <p className="text-sm text-muted-foreground">Loading documents…</p>
      )}

      {!loading && err && (
        <p className="text-sm text-red-600">{err}</p>
      )}

      {!loading && !err && (
        <div className="space-y-4">
          {/* Verification documents */}
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Verification documents
            </p>
            <div className="divide-y rounded-md border overflow-hidden">
              {VERIFICATION_DOC_TYPES.map(({ type, label }) => {
                const doc = byType.get(type) ?? null;
                return (
                  <DocRow
                    key={type}
                    label={label}
                    doc={doc}
                    editAllowed={editAllowed}
                    onReplace={onOpenEdit}
                  />
                );
              })}
            </div>
          </div>

          {/* Supporting documents */}
          {supportingDocs.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Supporting documents
              </p>
              <div className="divide-y rounded-md border overflow-hidden">
                {supportingDocs.map((doc) => (
                  <DocRow
                    key={doc.id}
                    label={docLabel(doc.doc_type)}
                    doc={doc}
                    editAllowed={editAllowed}
                    onReplace={onOpenEdit}
                  />
                ))}
              </div>
            </div>
          )}

          {docs?.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No documents uploaded yet.{" "}
              {editAllowed && (
                <button
                  type="button"
                  onClick={onOpenEdit}
                  className="underline hover:text-foreground"
                >
                  Open property editor to upload
                </button>
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function DocRow({
  label,
  doc,
  editAllowed,
  onReplace,
}: {
  label: string;
  doc: Doc | null;
  editAllowed: boolean;
  onReplace: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5 bg-white dark:bg-transparent">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm truncate">{label}</span>
        {doc ? (
          <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-green-100 text-green-800">
            Uploaded ✓
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-yellow-100 text-yellow-800">
            Not uploaded
          </span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {doc?.signed_url && (
          <a
            href={doc.signed_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs underline text-muted-foreground hover:text-foreground"
          >
            View
          </a>
        )}
        {editAllowed && (
          <button
            type="button"
            onClick={onReplace}
            className="text-xs underline text-muted-foreground hover:text-foreground"
          >
            {doc ? "Replace" : "Upload"}
          </button>
        )}
      </div>
    </div>
  );
}
