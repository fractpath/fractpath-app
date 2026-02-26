"use client";

import { useEffect } from "react";

export function Lightbox({
  open,
  src,
  alt,
  onClose,
}: {
  open: boolean;
  src: string | null;
  alt?: string;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !src) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="max-w-5xl w-full max-h-[90vh] bg-background rounded-lg overflow-hidden shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2 border-b">
          <div className="text-sm font-medium">{alt ?? "Preview"}</div>
          <button
            type="button"
            className="text-sm px-2 py-1 rounded border hover:bg-muted"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div className="p-3 flex items-center justify-center bg-black">
          <img
            src={src}
            alt={alt ?? "Preview"}
            className="max-h-[78vh] w-auto object-contain"
          />
        </div>
      </div>
    </div>
  );
}
