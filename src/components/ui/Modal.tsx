"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  primaryLabel?: string;
  primaryLoading?: boolean;
  primaryDisabled?: boolean;
  onPrimary?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  size?: "sm" | "md" | "lg";
  footer?: React.ReactNode;
};

const SIZE_CLASSES = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-xl",
};

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  primaryLabel,
  primaryLoading,
  primaryDisabled,
  onPrimary,
  secondaryLabel,
  onSecondary,
  size = "md",
  footer,
}: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, handleKeyDown]);

  if (!open || !mounted) return null;

  const content = (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`w-full ${SIZE_CLASSES[size]} rounded-xl border bg-background shadow-xl flex flex-col max-h-[90vh]`}
      >
        <div className="border-b px-6 py-4 flex-shrink-0 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">{title}</h2>
            {description ? (
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex-shrink-0 rounded p-1 hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-muted-foreground">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        {children ? <div className="px-6 py-4 overflow-y-auto flex-1">{children}</div> : null}

        {footer ? (
          <div className="border-t px-6 py-4 flex-shrink-0">{footer}</div>
        ) : (primaryLabel || secondaryLabel) ? (
          <div className="flex items-center justify-end gap-3 border-t px-6 py-4 flex-shrink-0">
            {secondaryLabel ? (
              <button
                type="button"
                onClick={onSecondary ?? onClose}
                className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted/50"
              >
                {secondaryLabel}
              </button>
            ) : null}
            {primaryLabel ? (
              <button
                type="button"
                onClick={onPrimary}
                disabled={primaryLoading || primaryDisabled}
                className="inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
              >
                {primaryLoading ? (
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent" />
                ) : null}
                {primaryLabel}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
