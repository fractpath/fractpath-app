"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { LoadingButton } from "@/components/ui/LoadingButton";
import { useToast } from "@/components/ui/Toast";
import { EULA_VERSION } from "@/lib/eula";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { createClient } from "@/lib/supabase/client";
import { PRIVACY_POLICY_TEXT, TERMS_OF_USE_TEXT, POLICY_EFFECTIVE_DATE, POLICY_VERSION } from "@/lib/policies/content";
import { createPortal } from "react-dom";

type Profile = {
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  eula_version: string | null;
};

type Step = "checking" | "email" | "profile" | "eula" | "done";
type PolicyTab = "privacy" | "terms";

function PolicyModal({
  onAccept,
  onDecline,
  accepting,
}: {
  onAccept: () => void;
  onDecline: () => void;
  accepting: boolean;
}) {
  const [activeTab, setActiveTab] = useState<PolicyTab>("privacy");
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const content = (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Policy agreement required"
        className="w-full max-w-2xl rounded-xl border bg-background shadow-xl flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="border-b px-6 py-4 flex-shrink-0">
          <h2 className="text-lg font-semibold">Agreement required</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            To continue using FractPath, you must read and accept both the Privacy Policy
            and Terms of Use (Version {POLICY_VERSION}, effective {POLICY_EFFECTIVE_DATE}).
          </p>
        </div>

        {/* Tabs */}
        <div className="border-b px-6 flex-shrink-0">
          <div className="flex gap-0">
            <button
              type="button"
              onClick={() => setActiveTab("privacy")}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "privacy"
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Privacy Policy
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("terms")}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "terms"
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Terms of Use
            </button>
          </div>
        </div>

        {/* Policy content — scrollable */}
        <div className="overflow-y-auto flex-1 px-6 py-4">
          <pre className="whitespace-pre-wrap text-xs text-foreground font-sans leading-relaxed">
            {activeTab === "privacy" ? PRIVACY_POLICY_TEXT : TERMS_OF_USE_TEXT}
          </pre>
        </div>

        {/* Footer */}
        <div className="border-t px-6 py-4 flex-shrink-0 space-y-3">
          <p className="text-xs text-muted-foreground">
            By clicking <strong>Accept both</strong>, you confirm that you have read and agree to
            both the Privacy Policy (Version {POLICY_VERSION}) and Terms of Use (Version {POLICY_VERSION}),
            effective {POLICY_EFFECTIVE_DATE}.
          </p>
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onDecline}
              disabled={accepting}
              className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted/50 disabled:opacity-50"
            >
              Decline and sign out
            </button>
            <LoadingButton loading={accepting} onClick={onAccept}>
              Accept both
            </LoadingButton>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}

export function OnboardingGate() {
  const t = useToast();
  const [step, setStep] = useState<Step>("checking");
  const [submitting, setSubmitting] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const supabaseRef = useRef(createClient());

  async function loadProfile(): Promise<Profile | null> {
    const res = await fetch("/api/me/profile");
    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    return json?.profile ?? null;
  }

  const evaluate = useCallback(async () => {
    setStep("checking");

    const supabase = supabaseRef.current;
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setStep("done");
      return;
    }

    setUserEmail(user.email ?? null);

    if (!user.email_confirmed_at) {
      setStep("email");
      return;
    }

    const p = await loadProfile();
    if (!p || !p.first_name || !p.last_name || !p.nickname) {
      setStep("profile");
      return;
    }
    if (p.eula_version !== EULA_VERSION) {
      setStep("eula");
      return;
    }
    setStep("done");
  }, []);

  useEffect(() => {
    evaluate();
  }, [evaluate]);

  async function resendConfirmation() {
    if (submitting || !userEmail) return;
    setSubmitting(true);
    try {
      const supabase = supabaseRef.current;
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: userEmail,
      });
      if (error) {
        t.error(error.message || "Couldn't resend — try again shortly.");
        return;
      }
      t.success("Confirmation email sent. Check your inbox.");
    } catch {
      t.error("Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function signOut() {
    window.location.href = "/auth/logout";
  }

  async function acceptPolicies() {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/me/eula", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        t.error(data?.error ?? "Couldn't record acceptance — please try again.");
        return;
      }
      t.success("Accepted. Welcome to FractPath.");
      await evaluate();
    } finally {
      setSubmitting(false);
    }
  }

  function declinePolicies() {
    window.location.href = "/eula-required";
  }

  if (step === "done" || step === "checking") return null;

  return (
    <>
      {step === "email" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border bg-background shadow-xl flex flex-col max-h-[90vh]">
            <div className="border-b px-6 py-4 flex-shrink-0">
              <h2 className="text-lg font-semibold">Verify your email</h2>
            </div>
            <div className="px-6 py-4 overflow-y-auto flex-1">
              <div className="text-sm text-muted-foreground">
                We sent a confirmation link to{" "}
                <span className="font-medium text-foreground">
                  {userEmail ?? "your email"}
                </span>
                . Please verify to continue.
              </div>
            </div>
            <div className="border-t px-6 py-4 flex-shrink-0 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md border px-3 py-2 text-sm"
                onClick={signOut}
              >
                Sign out
              </button>
              <LoadingButton loading={submitting} onClick={resendConfirmation}>
                Resend confirmation
              </LoadingButton>
            </div>
          </div>
        </div>
      )}

      {step === "profile" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border bg-background shadow-xl flex flex-col max-h-[90vh]">
            <div className="border-b px-6 py-4 flex-shrink-0">
              <h2 className="text-lg font-semibold">Complete your profile</h2>
            </div>
            <div className="px-6 py-4 overflow-y-auto flex-1">
              <ProfileForm
                onSuccess={async () => {
                  t.success("Profile saved.");
                  await evaluate();
                }}
              />
            </div>
          </div>
        </div>
      )}

      {step === "eula" && (
        <PolicyModal
          onAccept={acceptPolicies}
          onDecline={declinePolicies}
          accepting={submitting}
        />
      )}
    </>
  );
}
