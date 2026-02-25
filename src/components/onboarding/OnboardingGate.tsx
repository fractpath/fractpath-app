"use client";

import { useEffect, useState, useRef } from "react";
import { Modal } from "@/components/ui/Modal";
import { LoadingButton } from "@/components/ui/LoadingButton";
import { useToast } from "@/components/ui/Toast";
import { EULA_VERSION } from "@/lib/eula";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { createClient } from "@/lib/supabase/client";

type Profile = {
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  eula_version: string | null;
};

type Step = "checking" | "email" | "profile" | "eula" | "done";

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

  async function evaluate() {
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
  }

  useEffect(() => {
    evaluate();
  }, []);

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

  async function acceptEula() {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/me/eula", { method: "POST" });
      if (!res.ok) return t.error("Couldn't accept EULA.");
      t.success("Accepted.");
      await evaluate();
    } finally {
      setSubmitting(false);
    }
  }

  function declineEula() {
    window.location.href = "/eula-required";
  }

  if (step === "done" || step === "checking") return null;

  return (
    <>
      {step === "email" && (
        <Modal open={true} onClose={() => {}} title="Verify your email">
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              We sent a confirmation link to{" "}
              <span className="font-medium text-foreground">
                {userEmail ?? "your email"}
              </span>
              . Please verify to continue.
            </div>
            <div className="flex justify-end gap-2">
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
        </Modal>
      )}

      {step === "profile" && (
        <Modal open={true} onClose={() => {}} title="Complete your profile">
          <ProfileForm
            onSuccess={async () => {
              t.success("Profile saved.");
              await evaluate();
            }}
          />
        </Modal>
      )}

      {step === "eula" && (
        <Modal open={true} onClose={() => {}} title="Terms of use">
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              You must accept the EULA ({EULA_VERSION}) to continue.
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md border px-3 py-2 text-sm"
                onClick={declineEula}
              >
                Decline
              </button>
              <LoadingButton loading={submitting} onClick={acceptEula}>
                Accept
              </LoadingButton>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
