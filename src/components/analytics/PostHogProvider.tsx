"use client";

/**
 * PostHogProvider
 *
 * Initializes PostHog once on mount and captures a `marketing_page_viewed`
 * event (plus a PostHog native `$pageview`) on every route change.
 *
 * Wrapped in Suspense by the caller because useSearchParams() requires it in
 * the Next.js App Router.
 */

import { useEffect, Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  initPostHog,
  captureMarketingEvent,
  isPostHogReady,
} from "@/lib/analytics/posthog";
import posthog from "posthog-js";

function PageViewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!isPostHogReady()) return;

    const search = searchParams.toString();
    const url =
      window.location.origin + pathname + (search ? `?${search}` : "");

    // Native PostHog pageview (for funnel and session recording tools).
    posthog.capture("$pageview", { $current_url: url });

    // Custom marketing event with standard properties.
    captureMarketingEvent("marketing_page_viewed", {
      page_path: pathname,
      page_title: document.title,
    });
  }, [pathname, searchParams]);

  return null;
}

function PostHogInit() {
  useEffect(() => {
    initPostHog();
  }, []);

  return null;
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PostHogInit />
      <Suspense fallback={null}>
        <PageViewTracker />
      </Suspense>
      {children}
    </>
  );
}
