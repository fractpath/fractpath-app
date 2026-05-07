/**
 * Attribution tracking — first-touch and session.
 *
 * Client-side only. Never import from server components or API routes.
 *
 * First-touch: written to localStorage exactly once per browser profile.
 * Session:     written to sessionStorage on every new page/app load.
 */

export type FirstTouchAttribution = {
  first_entry_type?: string | null;
  first_entry_path?: string | null;
  first_source_page?: string | null;
  first_source_event?: string | null;
  first_audience?: string | null;
  first_property_id?: string | null;
  first_deal_id?: string | null;
  first_invite_type?: string | null;
  first_deal_origin?: string | null;
  first_utm_source?: string | null;
  first_utm_medium?: string | null;
  first_utm_campaign?: string | null;
  first_utm_content?: string | null;
  first_utm_term?: string | null;
  first_referrer?: string | null;
  first_seen_at?: string | null;
};

export type SessionAttribution = {
  session_entry_type?: string | null;
  session_entry_path?: string | null;
  session_source_page?: string | null;
  session_source_event?: string | null;
  session_audience?: string | null;
  session_utm_source?: string | null;
  session_utm_medium?: string | null;
  session_utm_campaign?: string | null;
  session_referrer?: string | null;
};

const FIRST_TOUCH_KEY = "fp:first_touch";
const SESSION_KEY = "fp:session_attr";

type RawParams = {
  entry?: string | null;
  source_page?: string | null;
  source_event?: string | null;
  audience?: string | null;
  property_id?: string | null;
  deal_id?: string | null;
  invite_type?: string | null;
  deal_origin?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  referrer?: string | null;
};

function extractHostname(rawUrl: string): string | null {
  try {
    return new URL(rawUrl).hostname || null;
  } catch {
    return null;
  }
}

function parseAttribution(url: string): RawParams {
  if (typeof window === "undefined") return {};

  let sp: URLSearchParams;
  try {
    sp = new URL(url).searchParams;
  } catch {
    return {};
  }

  const referrer =
    typeof document !== "undefined" && document.referrer
      ? extractHostname(document.referrer)
      : null;

  return {
    entry: sp.get("entry"),
    source_page: sp.get("source_page"),
    source_event: sp.get("source_event"),
    audience: sp.get("audience"),
    property_id: sp.get("property_id"),
    deal_id: sp.get("deal_id"),
    invite_type: sp.get("invite_type"),
    deal_origin: sp.get("deal_origin"),
    utm_source: sp.get("utm_source"),
    utm_medium: sp.get("utm_medium"),
    utm_campaign: sp.get("utm_campaign"),
    utm_content: sp.get("utm_content"),
    utm_term: sp.get("utm_term"),
    referrer,
  };
}

/**
 * Capture attribution from the current URL.
 *
 * - Session attribution is always refreshed.
 * - First-touch attribution is written to localStorage exactly once.
 *   Subsequent calls are no-ops for first-touch so it is never overwritten.
 */
export function captureAttribution(url: string): void {
  if (typeof window === "undefined") return;

  const params = parseAttribution(url);
  const entryPath =
    typeof window !== "undefined" ? window.location.pathname : null;

  // ── Session attribution (always refresh) ───────────────────────────────
  const session: SessionAttribution = {
    session_entry_type: params.entry,
    session_entry_path: entryPath,
    session_source_page: params.source_page,
    session_source_event: params.source_event,
    session_audience: params.audience,
    session_utm_source: params.utm_source,
    session_utm_medium: params.utm_medium,
    session_utm_campaign: params.utm_campaign,
    session_referrer: params.referrer,
  };

  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // sessionStorage may be unavailable (private browsing, storage quota)
  }

  // ── First-touch attribution (write once) ────────────────────────────────
  // Only record if there's at least one meaningful signal in the URL.
  const hasSignal = !!(
    params.entry ||
    params.source_page ||
    params.utm_source ||
    params.utm_medium ||
    params.utm_campaign ||
    params.referrer ||
    params.deal_id ||
    params.property_id ||
    params.invite_type
  );

  if (!hasSignal) return;

  // Never overwrite an existing first-touch record.
  try {
    if (localStorage.getItem(FIRST_TOUCH_KEY)) return;
  } catch {
    return; // localStorage unavailable
  }

  const firstTouch: FirstTouchAttribution = {
    first_entry_type: params.entry,
    first_entry_path: entryPath,
    first_source_page: params.source_page,
    first_source_event: params.source_event,
    first_audience: params.audience,
    first_property_id: params.property_id,
    first_deal_id: params.deal_id,
    first_invite_type: params.invite_type,
    first_deal_origin: params.deal_origin,
    first_utm_source: params.utm_source,
    first_utm_medium: params.utm_medium,
    first_utm_campaign: params.utm_campaign,
    first_utm_content: params.utm_content,
    first_utm_term: params.utm_term,
    first_referrer: params.referrer,
    first_seen_at: new Date().toISOString(),
  };

  try {
    localStorage.setItem(FIRST_TOUCH_KEY, JSON.stringify(firstTouch));
  } catch {
    // localStorage unavailable
  }
}

/** Read stored first-touch attribution. Returns empty object if none. */
export function getFirstTouchAttribution(): FirstTouchAttribution {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(FIRST_TOUCH_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as FirstTouchAttribution;
  } catch {
    return {};
  }
}

/** Read current session attribution. Returns empty object if none. */
export function getSessionAttribution(): SessionAttribution {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as SessionAttribution;
  } catch {
    return {};
  }
}

/** Clear first-touch attribution (testing / explicit reset only). */
export function clearFirstTouchAttribution(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(FIRST_TOUCH_KEY);
  } catch {
    // ignore
  }
}
