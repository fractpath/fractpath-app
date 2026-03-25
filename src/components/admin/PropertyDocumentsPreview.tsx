"use client";

import { useMemo, useState } from "react";

export type DocType = string;

export type DocRow = {
  doc_type: DocType;
  content_type: string | null;
  preview_token: string;
};

const VERIFICATION_DOC_TYPES: Array<{ docType: string; label: string }> = [
  { docType: "selfie", label: "Selfie" },
  { docType: "drivers_license", label: "Driver's License" },
  { docType: "utility_bill", label: "Utility Bill" },
];

const VERIFICATION_SET = new Set(VERIFICATION_DOC_TYPES.map((d) => d.docType));

const SUPPORTING_DOC_LABELS: Record<string, string> = {
  secured_debt_statement: "Debt / loan statement",
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
  const v = VERIFICATION_DOC_TYPES.find((d) => d.docType === docType);
  if (v) return v.label;
  return SUPPORTING_DOC_LABELS[docType] ?? docType.replace(/_/g, " ");
}

// Always return a ROOT-ABSOLUTE path (must start with "/")
function proxyUrl(propertyId: string, docType: string, token: string) {
  const path = `/api/admin/properties/${encodeURIComponent(
    propertyId,
  )}/documents/${encodeURIComponent(docType)}`;
  const u = new URL(path, "http://local");
  u.searchParams.set("t", token);
  return u.pathname + u.search;
}

function DocCard({
  label,
  row,
  propertyId,
  onOpen,
}: {
  label: string;
  row: DocRow | undefined;
  propertyId: string;
  onOpen: (r: DocRow) => void;
}) {
  const exists = !!row;
  const contentType = row?.content_type ?? "";
  const isImage = contentType.startsWith("image/");
  const isPdf = contentType === "application/pdf";
  const src = row ? proxyUrl(propertyId, row.doc_type, row.preview_token) : "";

  return (
    <button
      type="button"
      className="rounded-md border p-3 text-left space-y-2 hover:bg-muted/30 disabled:opacity-50"
      disabled={!exists}
      onClick={() => row && onOpen(row)}
      title={exists ? "Open preview" : "Missing"}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium truncate">{label}</div>
        <div className="text-xs text-muted-foreground shrink-0">
          {exists ? contentType || "unknown" : "missing"}
        </div>
      </div>

      {exists && isImage ? (
        <img
          src={src}
          alt={`${label} thumbnail`}
          className="h-40 w-full rounded object-cover bg-muted"
          loading="lazy"
        />
      ) : exists && isPdf ? (
        <div className="flex h-40 w-full items-center justify-center rounded bg-muted text-xs text-muted-foreground">
          PDF (click to preview)
        </div>
      ) : (
        <div className="flex h-40 w-full items-center justify-center rounded bg-muted text-xs text-muted-foreground">
          {exists ? "Unsupported type" : "No document"}
        </div>
      )}

      {exists ? (
        <div className="text-xs text-muted-foreground">Click to preview</div>
      ) : null}
    </button>
  );
}

function DocListRow({
  label,
  row,
  propertyId,
  onOpen,
}: {
  label: string;
  row: DocRow;
  propertyId: string;
  onOpen: (r: DocRow) => void;
}) {
  const contentType = row.content_type ?? "";
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5 border-b last:border-b-0">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm truncate">{label}</span>
        <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-green-100 text-green-800 shrink-0">
          ✓
        </span>
        {contentType && (
          <span className="text-xs text-muted-foreground shrink-0 hidden sm:block">
            {contentType}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={() => onOpen(row)}
        className="text-xs underline text-muted-foreground hover:text-foreground shrink-0"
      >
        Preview
      </button>
    </div>
  );
}

export function PropertyDocumentsPreview(props: {
  propertyId: string;
  docs: DocRow[];
}) {
  const { propertyId, docs } = props;
  const [open, setOpen] = useState<DocRow | null>(null);

  const { verificationMap, debtDocs, supportingDocs } = useMemo(() => {
    const verificationMap = new Map<string, DocRow>();
    const debtDocs: DocRow[] = [];
    const supportingDocs: DocRow[] = [];

    for (const d of docs) {
      if (VERIFICATION_SET.has(d.doc_type)) {
        verificationMap.set(d.doc_type, d);
      } else if (d.doc_type === "secured_debt_statement") {
        debtDocs.push(d);
      } else {
        supportingDocs.push(d);
      }
    }
    return { verificationMap, debtDocs, supportingDocs };
  }, [docs]);

  const hasSupportingOrDebt = debtDocs.length > 0 || supportingDocs.length > 0;

  return (
    <>
      {/* Verification documents */}
      <section className="rounded-lg border overflow-hidden">
        <div className="bg-muted/40 px-4 py-2 text-sm font-medium border-b">
          Verification documents
        </div>
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
          {VERIFICATION_DOC_TYPES.map(({ docType, label }) => (
            <DocCard
              key={docType}
              label={label}
              row={verificationMap.get(docType)}
              propertyId={propertyId}
              onOpen={setOpen}
            />
          ))}
        </div>
      </section>

      {/* Supporting documents */}
      <section className="rounded-lg border overflow-hidden">
        <div className="bg-muted/40 px-4 py-2 text-sm font-medium border-b flex items-center gap-2">
          Supporting documents
          {hasSupportingOrDebt && (
            <span className="text-xs font-normal text-muted-foreground">
              {debtDocs.length + supportingDocs.length} uploaded
            </span>
          )}
        </div>
        {!hasSupportingOrDebt ? (
          <div className="p-4 text-sm text-muted-foreground">
            No supporting documents uploaded by homeowner.
          </div>
        ) : (
          <div className="divide-y">
            {debtDocs.map((row, idx) => (
              <DocListRow
                key={`debt-${idx}`}
                label={idx === 0 ? "Debt / loan statement" : `Debt / loan statement (${idx + 1})`}
                row={row}
                propertyId={propertyId}
                onOpen={setOpen}
              />
            ))}
            {supportingDocs.map((row) => (
              <DocListRow
                key={row.doc_type}
                label={docLabel(row.doc_type)}
                row={row}
                propertyId={propertyId}
                onOpen={setOpen}
              />
            ))}
          </div>
        )}
      </section>

      {/* Lightbox */}
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(null)}
        >
          <div
            className="w-full max-w-5xl rounded bg-background p-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="text-sm font-medium">{docLabel(open.doc_type)}</div>
              <button
                type="button"
                className="rounded border px-2 py-1 text-sm hover:bg-muted/30"
                onClick={() => setOpen(null)}
              >
                Close
              </button>
            </div>

            {(() => {
              const contentType = open.content_type ?? "";
              const src = proxyUrl(propertyId, open.doc_type, open.preview_token);

              if (contentType.startsWith("image/")) {
                return (
                  <img
                    src={src}
                    alt="Document preview"
                    className="max-h-[80vh] w-full rounded object-contain bg-black/5"
                  />
                );
              }

              if (contentType === "application/pdf") {
                return (
                  <iframe
                    src={src}
                    title="PDF preview"
                    className="h-[80vh] w-full rounded border"
                  />
                );
              }

              return (
                <div className="rounded bg-muted p-4 text-sm text-muted-foreground">
                  Unsupported content type: {contentType || "unknown"}
                </div>
              );
            })()}
          </div>
        </div>
      ) : null}
    </>
  );
}
