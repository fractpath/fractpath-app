"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getSession().then(({ data, error }) => {
      if (error || !data.session) {
        router.replace("/login");
        return;
      }

      // Session is now persisted and cookies will be set
      router.replace("/protected");
    });
  }, [router]);

  return <p>Signing you in…</p>;
}
