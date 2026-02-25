"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { LoadingButton } from "@/components/ui/LoadingButton";
import { useToast } from "@/components/ui/Toast";
import { EULA_VERSION } from "@/lib/eula";
import { ProfileForm } from "@/components/profile/ProfileForm";

type Profile = {
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  eula_version: string | null;
};

type Step = "checking" | "profile" | "eula" | "done";

export function OnboardingGate() {
  const t = useToast();
  const [step, setStep] = useState<Step>("checking");
  const [submitting, setSubmitting] = useState(false);

  async function loadProfile(): Promise<Profile | null> {
    const res = await fetch("/api/me/profile");
    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    return json?.profile ?? null;
  }

  async function evaluate() {
    setStep("checking");
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

  async function acceptEula() {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/me/eula", { method: "POST" });
      if (!res.ok) return t.error("Couldn’t accept EULA.");
      t.success("Accepted.");
      await evaluate();
    } finally {
      setSubmitting(false);
    }
  }

  function decline() {
    window.location.href = "/eula-required";
  }

  if (step === "done" || step === "checking") return null;

  return (
    <>
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
                onClick={decline}
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
