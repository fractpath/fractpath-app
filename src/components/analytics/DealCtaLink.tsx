"use client";

import { captureAppEvent } from "@/lib/analytics/events";
import type { AppEventProps } from "@/lib/analytics/events";

type Props = {
  href: string;
  className?: string;
  children: React.ReactNode;
  analyticsProps: AppEventProps & { cta_location: string };
};

/**
 * Drop-in replacement for <Link> on deal-creation CTAs in server-component
 * pages. Fires deal_cta_clicked with property/origin context before navigating.
 */
export function DealCtaLink({ href, className, children, analyticsProps }: Props) {
  return (
    <a
      href={href}
      className={className}
      onClick={() => captureAppEvent("deal_cta_clicked", analyticsProps)}
    >
      {children}
    </a>
  );
}
