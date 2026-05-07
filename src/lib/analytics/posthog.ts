/**
 * PostHog analytics — client-side only.
 *
 * Import this module only from "use client" components or browser-safe hooks.
 * Never import it from server components, API routes, or middleware.
 */

import posthog from "posthog-js";

export type AudienceContext = "owner" | "buyer" | "investor" | "general";

export type MarketingEventName =
  | "marketing_page_viewed"
  | "marketing_cta_clicked"
  | "signup_cta_clicked"
  | "calculator_cta_clicked"
  | "owner_cta_clicked"
  | "buyer_cta_clicked"
  | "investor_brief_cta_clicked"
  | "contact_cta_clicked";

export type MarketingEventProps = {
  source?: string;
  page_path?: string;
  page_title?: string;
  cta_label?: string;
  cta_location?: string;
  destination_url?: string;
  audience_context?: AudienceContext;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  referrer?: string;
};

let _initialized = false;

/**
 * Initialize PostHog once. Safe to call multiple times — subsequent calls
 * are no-ops. Must only be called in a browser context (useEffect / "use client").
 */
export function initPostHog(): void {
  if (_initialized) return;
  if (typeof window === "undefined") return;

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host =
    process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

  if (!key) {
    // Key not configured — analytics silently disabled.
    return;
  }

  posthog.init(key, {
    api_host: host,
    // Manual pageview capture so we can attach custom properties.
    capture_pageview: false,
    // Respect Do Not Track.
    respect_dnt: true,
    // Disable autocapture to keep the event stream clean.
    autocapture: false,
    persistence: "localStorage+cookie",
    loaded(ph) {
      if (process.env.NODE_ENV === "development") {
        ph.debug();
      }
    },
  });

  _initialized = true;
}

/**
 * Returns true when PostHog has been successfully initialized.
 */
export function isPostHogReady(): boolean {
  return _initialized && typeof window !== "undefined";
}

/**
 * Read UTM parameters from the current page URL.
 */
export function readUtmParams(searchParams?: URLSearchParams): Pick<
  MarketingEventProps,
  "utm_source" | "utm_medium" | "utm_campaign" | "utm_content" | "utm_term"
> {
  if (typeof window === "undefined") return {};
  const sp = searchParams ?? new URLSearchParams(window.location.search);
  return {
    utm_source: sp.get("utm_source"),
    utm_medium: sp.get("utm_medium"),
    utm_campaign: sp.get("utm_campaign"),
    utm_content: sp.get("utm_content"),
    utm_term: sp.get("utm_term"),
  };
}

/**
 * Capture a marketing event with standard properties merged in.
 * Safe to call even if PostHog is not initialized — silently no-ops.
 */
export function captureMarketingEvent(
  eventName: MarketingEventName,
  props: MarketingEventProps = {},
): void {
  if (!isPostHogReady()) return;

  const utmParams =
    typeof window !== "undefined" ? readUtmParams() : {};

  posthog.capture(eventName, {
    source: "marketing_site",
    page_path:
      typeof window !== "undefined" ? window.location.pathname : undefined,
    page_title:
      typeof document !== "undefined" ? document.title : undefined,
    referrer:
      typeof document !== "undefined" ? document.referrer : undefined,
    ...utmParams,
    ...props,
  });
}

const APP_HOST_RE = /app\.fractpath\.com/i;

/**
 * Append FractPath marketing attribution parameters to a URL that points to
 * the app (app.fractpath.com or any path starting with /signup, /login, etc.).
 *
 * Existing UTM params are preserved; attribution params are added only when
 * they are not already present.
 */
export function buildAttributedUrl(
  href: string,
  opts: {
    sourcePage?: string;
    sourceEvent?: MarketingEventName;
    audience?: AudienceContext;
  } = {},
): string {
  if (typeof window === "undefined") return href;

  let url: URL;
  try {
    url = href.startsWith("http")
      ? new URL(href)
      : new URL(href, window.location.origin);
  } catch {
    return href;
  }

  const isAppLink =
    APP_HOST_RE.test(url.hostname) ||
    // Same-origin links to signup / login are also attribution targets.
    (url.hostname === window.location.hostname &&
      (url.pathname.startsWith("/signup") ||
        url.pathname.startsWith("/login")));

  if (!isAppLink) return href;

  const sp = url.searchParams;
  const currentUtm = readUtmParams();

  if (!sp.has("entry")) sp.set("entry", "marketing");
  if (!sp.has("source_page"))
    sp.set(
      "source_page",
      opts.sourcePage ?? window.location.pathname,
    );
  if (opts.sourceEvent && !sp.has("source_event"))
    sp.set("source_event", opts.sourceEvent);
  if (opts.audience && !sp.has("audience"))
    sp.set("audience", opts.audience);

  // Carry forward UTM params that aren't already in the destination URL.
  const utmKeys = [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
  ] as const;
  for (const key of utmKeys) {
    const val = currentUtm[key];
    if (val && !sp.has(key)) sp.set(key, val);
  }

  return url.toString();
}
