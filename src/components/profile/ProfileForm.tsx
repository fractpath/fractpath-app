"use client";

import { useMemo, useState } from "react";
import { LoadingButton } from "@/components/ui/LoadingButton";
import { useToast } from "@/components/ui/Toast";

type Profile = {
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  phone: string | null;
  marketing_opt_in: boolean | null;
  sms_consent: boolean | null;
};

export function ProfileForm(props: {
  initial?: Partial<Profile> | null;
  onSuccess?: () => void;
}) {
  const t = useToast();

  const initial = useMemo(() => {
    const p = props.initial ?? {};
    return {
      first_name: (p.first_name ?? "") as string,
      last_name: (p.last_name ?? "") as string,
      nickname: (p.nickname ?? "") as string,
      phone: (p.phone ?? "") as string,
      marketing_opt_in: p.marketing_opt_in !== false, // negative consent default true
      sms_consent: p.sms_consent === true,
    };
  }, [props.initial]);

  const [firstName, setFirstName] = useState(initial.first_name);
  const [lastName, setLastName] = useState(initial.last_name);
  const [nickname, setNickname] = useState(initial.nickname);
  const [phone, setPhone] = useState(initial.phone);
  const [marketingOptIn, setMarketingOptIn] = useState(
    initial.marketing_opt_in,
  );
  const [smsConsent, setSmsConsent] = useState(initial.sms_consent);

  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    const payload = {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      nickname: nickname.trim(),
      phone: phone.trim() || null,
      marketing_opt_in: marketingOptIn,
      sms_consent: smsConsent,
    };

    if (!payload.first_name) return t.error("First name is required.");
    if (!payload.last_name) return t.error("Last name is required.");
    if (!payload.nickname) return t.error("Display name is required.");

    setSubmitting(true);
    try {
      const res = await fetch("/api/me/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        return t.error(json?.error || "Couldn’t save that — try again.");
      }

      t.success("Saved — you’re all set.");
      props.onSuccess?.();
    } catch {
      t.error("Something went sideways. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <div className="text-sm font-medium">First name</div>
          <input
            className="w-full rounded-md border px-3 py-2 text-sm"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            autoComplete="given-name"
            required
          />
        </label>

        <label className="space-y-1">
          <div className="text-sm font-medium">Last name</div>
          <input
            className="w-full rounded-md border px-3 py-2 text-sm"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            autoComplete="family-name"
            required
          />
        </label>
      </div>

      <label className="space-y-1">
        <div className="text-sm font-medium">Display name</div>
        <div className="text-xs text-muted-foreground">
          This is what we’ll show across the app.
        </div>
        <input
          className="w-full rounded-md border px-3 py-2 text-sm"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          autoComplete="nickname"
          required
        />
      </label>

      <label className="space-y-1">
        <div className="text-sm font-medium">Phone (optional)</div>
        <div className="text-xs text-muted-foreground">
          Used for account support and service updates — not marketing.
        </div>
        <input
          className="w-full rounded-md border px-3 py-2 text-sm"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          inputMode="tel"
          autoComplete="tel"
        />
      </label>

      <div className="space-y-3">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1"
            checked={marketingOptIn}
            onChange={(e) => setMarketingOptIn(e.target.checked)}
          />
          <div>
            <div className="text-sm font-medium">
              Email me product updates and helpful resources
            </div>
            <div className="text-xs text-muted-foreground">
              Uncheck to opt out.
            </div>
          </div>
        </label>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1"
            checked={smsConsent}
            onChange={(e) => setSmsConsent(e.target.checked)}
          />
          <div>
            <div className="text-sm font-medium">
              I agree to receive text messages for account servicing and
              security
            </div>
            <div className="text-xs text-muted-foreground">
              Message &amp; data rates may apply. Reply STOP to opt out.
            </div>
          </div>
        </label>
      </div>

      <div className="pt-2">
        <LoadingButton loading={submitting} type="submit">
          Save
        </LoadingButton>
      </div>
    </form>
  );
}
