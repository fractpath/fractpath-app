"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { ProfileForm } from "./ProfileForm";

type Profile = {
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  phone: string | null;
  marketing_opt_in: boolean;
  sms_consent: boolean;
  eula_version: string | null;
};

export function ProfileReviewCard({ email }: { email: string }) {
  const t = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/me/profile");
      const json = await res.json().catch(() => null);
      if (!res.ok) return t.error("Couldn't load profile.");
      setProfile(json?.profile ?? null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <div className="rounded-md border p-4 text-sm text-muted-foreground">
        Loading profile…
      </div>
    );
  }

  return (
    <>
      <section className="rounded-md border p-4 space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium">Profile</h2>
          <button
            className="text-sm underline"
            onClick={() => setEditing(true)}
          >
            Edit
          </button>
        </div>

        <div className="text-sm space-y-1">
          <div>
            <strong>Email:</strong> {email}
          </div>
          <div>
            <strong>First name:</strong> {profile?.first_name ?? "—"}
          </div>
          <div>
            <strong>Last name:</strong> {profile?.last_name ?? "—"}
          </div>
          <div>
            <strong>Nickname:</strong> {profile?.nickname ?? "—"}
          </div>
          <div>
            <strong>Marketing emails:</strong>{" "}
            {profile?.marketing_opt_in ? "Enabled" : "Disabled"}
          </div>
          <div>
            <strong>SMS consent:</strong>{" "}
            {profile?.sms_consent ? "Granted" : "Not granted"}
          </div>
          <div>
            <strong>EULA version:</strong> {profile?.eula_version ?? "—"}
          </div>
        </div>
      </section>

      {editing && (
        <Modal
          open={true}
          onClose={() => setEditing(false)}
          title="Update profile"
        >
          <ProfileForm
            initial={profile}
            onSuccess={async () => {
              t.success("Profile updated.");
              setEditing(false);
              await load();
            }}
          />
        </Modal>
      )}
    </>
  );
}
