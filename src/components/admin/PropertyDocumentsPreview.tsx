"use client";

import { useMemo, useState } from "react";

type DocType = "selfie" | "drivers_license" | "utility_bill";

type DocRow = {
  doc_type: DocType;
  content_type: string | null;
  preview_token: string;
};

const DOCS: Array<{ docType: DocType; label: string }> = [
  { docType: "selfie", label: "Selfie" },
  { docType: "drivers_license", label: "Driver’s License" },
  { docType: "utility_bill", label: "Utility Bill" },
];

// Always return a ROOT-ABSOLUTE path (must start with "/")
function proxyUrl(propertyId: string, docType: DocType, token: string) {
  const path = `/api/admin/properties/${encodeURIComponent(
    propertyId,
  )}/documents/${encodeURIComponent(docType)}`;

  // Ensure browser treats it as root-absolute (not relative)
  // Using URL normalizes edge cases like accidental missing leading slash.
  const u = new URL(path, "http://local");
  u.searchParams.set("t", token);
  return u.pathname + u.search;
}

export function PropertyDocumentsPreview(props: {
  propertyId: string;
  docs: DocRow[];
}) {
  const { propertyId, docs } = props;
  const [open, setOpen] = useState<DocType | null>(null);

  const byType = useMemo(() => {
    const m = new Map<DocType, DocRow>();
    for (const d of docs) m.set(d.doc_type, d);
    return m;
  }, [docs]);

  return (
    <section className="rounded-lg border p-4 space-y-3">
      <div className="text-sm font-medium">Documents</div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {DOCS.map(({ docType, label }) => {
          const row = byType.get(docType);
          const exists = !!row;

          const contentType = row?.content_type ?? "";
          const isImage = contentType.startsWith("image/");
          const isPdf = contentType === "application/pdf";

          const src = row
            ? proxyUrl(propertyId, docType, row.preview_token)
            : "";

          return (
            <button
              key={docType}
              type="button"
              className="rounded-md border p-3 text-left space-y-2 hover:bg-muted/30 disabled:opacity-50"
              disabled={!exists}
              onClick={() => setOpen(docType)}
              title={exists ? "Open preview" : "Missing"}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium">{label}</div>
                <div className="text-xs text-muted-foreground">
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
                <div className="text-xs text-muted-foreground">
                  Click to preview
                </div>
              ) : null}
            </button>
          );
        })}
      </div>

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
              <div className="text-sm font-medium">
                {DOCS.find((d) => d.docType === open)?.label ?? open}
              </div>
              <button
                type="button"
                className="rounded border px-2 py-1 text-sm hover:bg-muted/30"
                onClick={() => setOpen(null)}
              >
                Close
              </button>
            </div>

            {(() => {
              const row = byType.get(open);
              if (!row) {
                return (
                  <div className="rounded bg-muted p-4 text-sm text-muted-foreground">
                    Document missing.
                  </div>
                );
              }

              const contentType = row.content_type ?? "";
              const src = proxyUrl(propertyId, open, row.preview_token);

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
    </section>
  );
}
