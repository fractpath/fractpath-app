"use client";

import { useEffect, useCallback } from "react";

type LightboxProps =
  | {
      open: boolean;
      images: string[];
      index: number;
      onNavigate: (i: number) => void;
      onClose: () => void;
      alt?: string;
      src?: never;
    }
  | {
      open: boolean;
      src: string | null;
      alt?: string;
      onClose: () => void;
      images?: never;
      index?: never;
      onNavigate?: never;
    };

export function Lightbox(props: LightboxProps) {
  const { open, onClose } = props;

  const isGallery = Array.isArray(props.images);
  const images = isGallery ? props.images : null;
  const index = isGallery ? (props.index ?? 0) : 0;
  const onNavigate = isGallery ? props.onNavigate : undefined;

  const src = isGallery
    ? (images![index] ?? null)
    : (props.src ?? null);
  const alt = props.alt ?? "Preview";
  const total = images?.length ?? 0;
  const hasPrev = isGallery && index > 0;
  const hasNext = isGallery && index < total - 1;

  const goPrev = useCallback(() => {
    if (hasPrev && onNavigate) onNavigate(index - 1);
  }, [hasPrev, onNavigate, index]);

  const goNext = useCallback(() => {
    if (hasNext && onNavigate) onNavigate(index + 1);
  }, [hasNext, onNavigate, index]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!open) return;
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, goPrev, goNext]);

  if (!open || !src) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="max-w-5xl w-full max-h-[90vh] bg-background rounded-lg overflow-hidden shadow-lg"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b">
          <div className="text-sm font-medium">
            {isGallery && total > 1
              ? `${index + 1} / ${total}`
              : alt}
          </div>
          <button
            type="button"
            className="text-sm px-2 py-1 rounded border hover:bg-muted"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        {/* Image area with optional prev/next */}
        <div className="relative flex items-center justify-center bg-black p-3 min-h-[300px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={isGallery && total > 1 ? `Photo ${index + 1} of ${total}` : alt}
            className="max-h-[75vh] w-auto object-contain"
          />

          {hasPrev && (
            <button
              type="button"
              onClick={goPrev}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 hover:bg-black/70 text-white p-2 focus:outline-none"
              aria-label="Previous image"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
              </svg>
            </button>
          )}

          {hasNext && (
            <button
              type="button"
              onClick={goNext}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 hover:bg-black/70 text-white p-2 focus:outline-none"
              aria-label="Next image"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
