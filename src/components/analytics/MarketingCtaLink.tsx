"use client";

/**
 * MarketingCtaLink
 *
 * A drop-in replacement for <a> / Next.js <Link> that:
 * 1. Fires a PostHog event before navigation.
 * 2. Appends attribution parameters when the destination is an app link
 *    (app.fractpath.com or same-origin /signup, /login).
 *
 * Usage:
 *   <MarketingCtaLink
 *     href="/signup?persona=homeowner"
 *     eventName="signup_cta_clicked"
 *     ctaLabel="Get Started as Owner"
 *     ctaLocation="hero"
 *     audienceContext="owner"
 *   >
 *     Get Started
 *   </MarketingCtaLink>
 */

import { usePathname } from "next/navigation";
import {
  captureMarketingEvent,
  buildAttributedUrl,
  type MarketingEventName,
  type AudienceContext,
} from "@/lib/analytics/posthog";

type Props = {
  href: string;
  eventName?: MarketingEventName;
  ctaLabel?: string;
  ctaLocation?: string;
  audienceContext?: AudienceContext;
  className?: string;
  style?: React.CSSProperties;
  target?: string;
  rel?: string;
  children: React.ReactNode;
  /** Extra properties merged into the event payload. */
  extraProps?: Record<string, unknown>;
};

export function MarketingCtaLink({
  href,
  eventName = "marketing_cta_clicked",
  ctaLabel,
  ctaLocation,
  audienceContext = "general",
  className,
  style,
  target,
  rel,
  children,
  extraProps,
}: Props) {
  const pathname = usePathname();

  function handleClick() {
    const attributedHref = buildAttributedUrl(href, {
      sourcePage: pathname,
      sourceEvent: eventName,
      audience: audienceContext,
    });

    captureMarketingEvent(eventName, {
      cta_label: ctaLabel,
      cta_location: ctaLocation,
      destination_url: attributedHref,
      audience_context: audienceContext,
      ...extraProps,
    });
  }

  // Compute the final href with attribution (applied at render time for
  // right-click / cmd+click scenarios, refreshed on click for accuracy).
  const finalHref =
    typeof window !== "undefined"
      ? buildAttributedUrl(href, {
          sourcePage: pathname,
          sourceEvent: eventName,
          audience: audienceContext,
        })
      : href;

  return (
    <a
      href={finalHref}
      onClick={handleClick}
      className={className}
      style={style}
      target={target}
      rel={
        rel ??
        (target === "_blank" ? "noopener noreferrer" : undefined)
      }
    >
      {children}
    </a>
  );
}
