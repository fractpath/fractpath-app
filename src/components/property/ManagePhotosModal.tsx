"use client";

import { useState, useRef, useCallback } from "react";
import { Modal } from "@/components/ui/Modal";
import type { OwnerPhoto } from "@/lib/property/photos";
import { activePhotos } from "@/lib/property/photos";

type Props = {
  propertyId: string;
  initialPhotos: OwnerPhoto[];
  onClose: () => void;
  onPhotosChange: (photos: OwnerPhoto[]) => void;
};

function StarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 1l1.8 3.6L14 5.3l-3 2.9.7 4.1L8 10.4l-3.7 1.9.7-4.1-3-2.9 4.2-.7L8 1z" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  );
}

function ChevronUpIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  );
}

export function ManagePhotosModal({
  propertyId,
  initialPhotos,
  onClose,
  onPhotosChange,
}: Props) {
  const [photos, setPhotos] = useState<OwnerPhoto[]>(initialPhotos);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const active = activePhotos(photos);

  const refreshPhotos = useCallback(async () => {
    const res = await fetch(`/api/me/properties/${propertyId}/photos`);
    if (res.ok) {
      const data = await res.json();
      setPhotos(data.photos ?? []);
      onPhotosChange(data.photos ?? []);
    }
  }, [propertyId, onPhotosChange]);

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/me/properties/${propertyId}/photos`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Upload failed. Please try again.");
        break;
      }
    }
    setUploading(false);
    await refreshPhotos();
  }

  async function handleRemove(photoId: string) {
    setBusy(photoId + ":remove");
    setError(null);
    const res = await fetch(
      `/api/me/properties/${propertyId}/photos/${photoId}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to remove photo.");
    } else {
      await refreshPhotos();
    }
    setBusy(null);
  }

  async function handleSetHero(photoId: string) {
    setBusy(photoId + ":hero");
    setError(null);
    const res = await fetch(
      `/api/me/properties/${propertyId}/photos/${photoId}/hero`,
      { method: "PATCH" },
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to set hero photo.");
    } else {
      await refreshPhotos();
    }
    setBusy(null);
  }

  async function handleMove(photoId: string, direction: "up" | "down") {
    const idx = active.findIndex((p) => p.id === photoId);
    if (idx < 0) return;
    if (direction === "up" && idx === 0) return;
    if (direction === "down" && idx === active.length - 1) return;

    const newOrder = [...active];
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    [newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]];

    setBusy(photoId + ":move");
    setError(null);
    const res = await fetch(
      `/api/me/properties/${propertyId}/photos/reorder`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds: newOrder.map((p) => p.id) }),
      },
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to reorder photos.");
    } else {
      await refreshPhotos();
    }
    setBusy(null);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Manage photos"
      description="Upload, reorder, and select the hero photo shown first to buyers."
      size="lg"
      footer={
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">
            {active.length} photo{active.length !== 1 ? "s" : ""} uploaded
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted/50"
          >
            Done
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* ── Upload zone ─────────────────────────────────────────────────── */}
        <div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full rounded-lg border-2 border-dashed border-muted-foreground/30 hover:border-muted-foreground/60 py-6 flex flex-col items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-wait"
          >
            <svg
              className="w-7 h-7 text-muted-foreground/50"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
              />
            </svg>
            <span className="text-sm font-medium text-muted-foreground">
              {uploading ? "Uploading…" : "Click to upload photos"}
            </span>
            <span className="text-xs text-muted-foreground/70">
              JPG, PNG, or WebP · max 10 MB each
            </span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="sr-only"
            onChange={(e) => handleUpload(e.target.files)}
          />
        </div>

        {/* ── Error banner ─────────────────────────────────────────────────── */}
        {error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* ── Photo list ──────────────────────────────────────────────────── */}
        {active.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No photos yet. Upload some above.
          </p>
        ) : (
          <ul className="space-y-2">
            {active.map((photo, idx) => {
              const isBusy = busy?.startsWith(photo.id);
              return (
                <li
                  key={photo.id}
                  className="flex items-center gap-3 rounded-lg border p-2 bg-muted/30"
                >
                  {/* Thumbnail */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.public_url}
                    alt=""
                    className="w-16 h-12 rounded object-cover flex-none"
                  />

                  {/* Hero star badge */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {photo.is_hero && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded px-1.5 py-0.5">
                          <StarIcon className="w-3 h-3" />
                          Hero
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground tabular-nums">
                        Photo {idx + 1}
                      </span>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-1 flex-none">
                    {/* Move up */}
                    <button
                      type="button"
                      disabled={isBusy || idx === 0}
                      onClick={() => handleMove(photo.id, "up")}
                      className="p-1.5 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-default transition-colors"
                      aria-label="Move up"
                    >
                      <ChevronUpIcon className="w-4 h-4" />
                    </button>

                    {/* Move down */}
                    <button
                      type="button"
                      disabled={isBusy || idx === active.length - 1}
                      onClick={() => handleMove(photo.id, "down")}
                      className="p-1.5 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-default transition-colors"
                      aria-label="Move down"
                    >
                      <ChevronDownIcon className="w-4 h-4" />
                    </button>

                    {/* Set hero */}
                    {!photo.is_hero && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleSetHero(photo.id)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border hover:bg-muted transition-colors disabled:opacity-50"
                        aria-label="Set as hero"
                      >
                        <StarIcon className="w-3 h-3 text-amber-500" />
                        Set hero
                      </button>
                    )}

                    {/* Remove */}
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleRemove(photo.id)}
                      className="p-1.5 rounded hover:bg-destructive/10 text-destructive/70 hover:text-destructive disabled:opacity-50 transition-colors"
                      aria-label="Remove photo"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* ── Hero explanation ─────────────────────────────────────────────── */}
        {active.length > 0 && (
          <p className="text-xs text-muted-foreground border-t pt-3">
            The <span className="font-medium">hero photo</span> appears first in
            the gallery and is used as the primary image buyers see. If no hero
            is set, the first photo in order is used.
          </p>
        )}
      </div>
    </Modal>
  );
}
