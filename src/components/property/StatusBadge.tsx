import type { ReactNode } from "react";

/**
 * Shared accessible badge component with dark tooltip on hover and keyboard focus.
 * Used across PropertyPageHeader, PropertyStatusLanes, and PropertyDetailClient
 * to provide consistent explanatory tooltips for all property status badges.
 */
export function StatusBadge({
  className,
  tooltip,
  children,
}: {
  className: string;
  tooltip?: string;
  children: ReactNode;
}) {
  return (
    <span className="relative group inline-flex">
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium border cursor-default select-none ${className}`}
        tabIndex={tooltip ? 0 : undefined}
        title={tooltip}
      >
        {children}
      </span>

      {tooltip && (
        <span
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-56 rounded bg-gray-900 px-2.5 py-1.5 text-xs text-white shadow-lg opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150 whitespace-normal leading-snug"
        >
          {tooltip}
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
        </span>
      )}
    </span>
  );
}
