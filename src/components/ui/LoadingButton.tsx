"use client";

export type LoadingButtonProps = {
  loading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "outline" | "ghost";
  type?: "button" | "submit";
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
};

const VARIANT_CLASSES: Record<string, string> = {
  primary:
    "bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50",
  outline:
    "border hover:bg-muted/50 disabled:opacity-50",
  ghost:
    "hover:bg-muted/50 disabled:opacity-50",
};

export function LoadingButton({
  loading,
  disabled,
  variant = "primary",
  type = "button",
  onClick,
  children,
  className,
}: LoadingButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={loading || disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${VARIANT_CLASSES[variant] ?? VARIANT_CLASSES.primary} ${className ?? ""}`}
    >
      {loading ? (
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : null}
      {children}
    </button>
  );
}
