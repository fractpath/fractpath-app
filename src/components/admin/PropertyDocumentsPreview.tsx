"use client";

import { useMemo, useState } from "react";
import { Lightbox } from "@/components/admin/Lightbox";

type DocRow = {
  id: string;
  doc_type: string;
  content_type: string | null;
  signed_url: string | null;
  created_at?: string | null;
};

const DOC_TYPE_LABELS: Record<string, string> = {
  selfie: "Selfie",
  drivers_license: "Driver License",
  utility_bill: "Utility / Bill",
};

export function PropertyDocumentsPreview({ docs }: { docs: DocRow[] }) {
  const [openSrc, setOpenSrc] = useState<string | null>(null);
  const [openAlt, setOpenAlt] = useState<string>("Preview");

  const ordered = useMemo(() => {
    const rank = (t: string) =>
      t === "selfie" ? 1 : t === "drivers_license" ? 2 : t === "utility_bill" ? 3 : 99;
    return [...docs].sort((a, b) => rank(a.doc_type) - rank(b.doc_type));
  }, [docs]);

  return (
    <div className="rounded-lg border p-4">
      <h2 className="text-base font-semibold mb-3">Verification documents</h2>

      {ordered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No documents uploaded.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {ordered.map((d) => {
            const label = DOC_TYPE_LABELS[d.doc_type] ?? d.doc_type;
            const isImage = (d.content_type ?? "").startsWith("image/");
            const url = d.signed_url;

            return (
              <div key={d.id} className="rounded-md border p-3 space-y-2">
                <div className="text-sm font-medium">{label}</div>

                {url ? (
                  isImage ? (
                    <button
                      type="button"
                      className="block w-full text-left"
                      onClick={() => {
                        setOpenAlt(label);
                        setOpenSrc(url);
                      }}
                    >
                      <img
                        src={url}
                        alt={label}
                        className="w-full h-40 object-cover rounded border"
                      />
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        Click to enlarge
                      </div>
                    </button>
                  ) : (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block rounded border p-3 text-center text-xs hover:bg-muted"
                    >
                      View document
                    </a>
                  )
                ) : (
                  <div className="text-xs text-muted-foreground">URL unavailable</div>
                )}

                <div className="text-[10px] text-muted-foreground break-words">
                  {d.content_type ?? ""}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Lightbox
        open={!!openSrc}
        src={openSrc}
        alt={openAlt}
        onClose={() => setOpenSrc(null)}
      />
    </div>
  );
}
