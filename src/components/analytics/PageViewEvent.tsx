"use client";

/**
 * PageViewEvent
 *
 * A zero-render client component that fires a single PostHog event on mount.
 * Drop this into any server-component page to track page-level events without
 * converting the parent to a client component.
 *
 * Usage:
 *   <PageViewEvent event="dashboard_viewed" props={{ deal_id: dealId }} />
 *
 * The event fires exactly once per mount. It will not re-fire on React
 * re-renders or on hot reload (dev only).
 */

import { useEffect, useRef } from "react";
import { captureAppEvent } from "@/lib/analytics/events";
import type { AppEventName, AppEventProps } from "@/lib/analytics/events";

type Props = {
  event: AppEventName;
  props?: AppEventProps;
};

export function PageViewEvent({ event, props }: Props) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    captureAppEvent(event, props ?? {});
    // Intentionally not including `event` or `props` in the dep array —
    // this must fire exactly once per mount, not on prop changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
