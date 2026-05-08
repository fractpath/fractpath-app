"use client";

/**
 * PostHogProvider
 *
 * Mounts once at the root layout and handles:
 * 1. PostHog initialization (once per page load)
 * 2. Attribution capture from URL params (first-touch + session)
 * 3. Native $pageview + marketing_page_viewed on every route change
 * 4. User identity sync via Supabase onAuthStateChange
 *    - SIGNED_IN → posthog.identify(user.id, {...})
 *    - SIGNED_OUT → posthog.reset()
 */

import { useEffect, useRef, Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import posthog from "posthog-js";
import {
  initPostHog,
  isPostHogReady,
  identifyUser,
  resetIdentity,
  captureMarketingEvent,
} from "@/lib/analytics/posthog";
import {
  captureAttribution,
  getFirstTouchAttribution,
  getSessionAttribution,
} from "@/lib/analytics/attribution";
import { captureAppEvent } from "@/lib/analytics/events";
import { createSupabaseBrowserClient } from "@/app/lib/supabaseBrowser";

// ── Init ──────────────────────────────────────────────────────────────────

function PostHogInit() {
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    console.log("[FractPath Analytics] Provider mounted");
    initPostHog();
  }, []);

  return null;
}

// ── Attribution capture ───────────────────────────────────────────────────

function AttributionCapture() {
  const searchParams = useSearchParams();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    // Always run captureAttribution so session attribution is up to date.
    captureAttribution(window.location.href);
    console.log("[FractPath Analytics] attribution persisted");

    // If this is a tracked entry from marketing, fire app_entered.
    const entry = searchParams.get("entry");
    if (entry && isPostHogReady()) {
      const session = getSessionAttribution();
      captureAppEvent("app_entered", {
        entry_type: entry,
        source_page: session.session_source_page ?? undefined,
        source_event: session.session_source_event ?? undefined,
        audience: session.session_audience ?? undefined,
        utm_source: session.session_utm_source ?? undefined,
        utm_medium: session.session_utm_medium ?? undefined,
        utm_campaign: session.session_utm_campaign ?? undefined,
        referrer: session.session_referrer ?? undefined,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

// ── Page view tracking ────────────────────────────────────────────────────

function PageViewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!isPostHogReady()) return;

    const search = searchParams.toString();
    const url =
      window.location.origin + pathname + (search ? `?${search}` : "");

    // Native PostHog pageview (used by funnels, recordings, heat maps).
    posthog.capture("$pageview", { $current_url: url });

    // Custom marketing page view (for marketing-site continuity).
    captureMarketingEvent("marketing_page_viewed", {
      page_path: pathname,
      page_title:
        typeof document !== "undefined" ? document.title : undefined,
    });
  }, [pathname, searchParams]);

  return null;
}

// ── Auth identity sync ────────────────────────────────────────────────────

/**
 * Listens to Supabase auth state changes and syncs PostHog identity.
 *
 * SIGNED_IN:  identify the user with role + first-touch attribution.
 * SIGNED_OUT: reset PostHog so the next anonymous session is unlinked.
 *
 * A sessionStorage flag ("fp:just_signed_up") written by auth/finish prevents
 * a duplicate login_completed event when signup redirects back to the app.
 */
function AuthIdentitySync() {
  useEffect(() => {
    let supabase: ReturnType<typeof createSupabaseBrowserClient>;
    try {
      supabase = createSupabaseBrowserClient();
    } catch {
      return; // Supabase env vars not available
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isPostHogReady()) return;

      if (event === "SIGNED_IN" && session?.user) {
        const user = session.user;
        const userRole =
          user.user_metadata?.role ??
          user.user_metadata?.persona ??
          "homeowner";

        // Attach first-touch attribution so all identify calls carry origin.
        const firstTouch = getFirstTouchAttribution();

        identifyUser(user.id, {
          user_role: userRole,
          account_created_at: user.created_at,
          email: user.email ?? null,
          ...firstTouch,
        });

        // Determine if this is a fresh signup or a returning login.
        // auth/finish sets this flag after exchanging the email-confirm code.
        let justSignedUp = false;
        try {
          justSignedUp = !!sessionStorage.getItem("fp:just_signed_up");
          if (justSignedUp) sessionStorage.removeItem("fp:just_signed_up");
        } catch {
          // sessionStorage unavailable
        }

        if (justSignedUp) {
          captureAppEvent("signup_completed", { user_role: userRole });
        } else {
          captureAppEvent("login_completed", { user_role: userRole });
        }
      }

      if (event === "SIGNED_OUT") {
        captureAppEvent("logout_completed", {});
        resetIdentity();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return null;
}

// ── Provider ──────────────────────────────────────────────────────────────

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PostHogInit />
      <Suspense fallback={null}>
        <AttributionCapture />
        <PageViewTracker />
      </Suspense>
      <AuthIdentitySync />
      {children}
    </>
  );
}
