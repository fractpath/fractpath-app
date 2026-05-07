"use client";

import { useEffect } from "react";
import { captureAppEvent } from "@/lib/analytics/events";

/**
 * Drop into the /signup server-component page to fire signup_started on mount
 * and stamp sessionStorage so PostHogProvider fires signup_completed (not
 * login_completed) when the resulting SIGNED_IN auth event lands.
 */
export function SignupTracker() {
  useEffect(() => {
    captureAppEvent("signup_started", {});

    function markSignup() {
      try {
        sessionStorage.setItem("fp:just_signed_up", "1");
      } catch {}
    }

    const form = document.querySelector<HTMLFormElement>(
      "form[action='/auth/signup']",
    );
    form?.addEventListener("submit", markSignup);
    return () => {
      form?.removeEventListener("submit", markSignup);
    };
  }, []);

  return null;
}
