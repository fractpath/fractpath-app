"use client";

import { useEffect } from "react";
import { captureAppEvent } from "@/lib/analytics/events";

/**
 * Drop into the /signup server-component page.
 *
 * Fires signup_started on explicit user intent (submit button mousedown or
 * form submit) — not on passive page load — and deduplicates within the
 * session using the fp:signup_started_tracked guard.
 *
 * Also stamps fp:just_signed_up so PostHogProvider fires signup_completed
 * (not login_completed) when the resulting SIGNED_IN auth event lands.
 */
export function SignupTracker() {
  useEffect(() => {
    function fireSignupStartedOnce() {
      try {
        if (sessionStorage.getItem("fp:signup_started_tracked")) return;
        sessionStorage.setItem("fp:signup_started_tracked", "1");
      } catch {}
      captureAppEvent("signup_started", {});
    }

    function handleFormSubmit() {
      fireSignupStartedOnce();
      try {
        sessionStorage.setItem("fp:just_signed_up", "1");
      } catch {}
    }

    const form = document.querySelector<HTMLFormElement>(
      "form[action='/auth/signup']",
    );
    if (!form) return;

    const submitBtn = form.querySelector<HTMLButtonElement>(
      "button[type='submit'], input[type='submit']",
    );
    submitBtn?.addEventListener("mousedown", fireSignupStartedOnce);
    form.addEventListener("submit", handleFormSubmit);

    return () => {
      submitBtn?.removeEventListener("mousedown", fireSignupStartedOnce);
      form.removeEventListener("submit", handleFormSubmit);
    };
  }, []);

  return null;
}
