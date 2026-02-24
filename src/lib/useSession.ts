"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

export function useSession() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | null = null;

    async function run() {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();

        if (!mounted) return;

        setUser(data.user ?? null);
        setIsLoading(false);

        const { data: sub } = supabase.auth.onAuthStateChange(
          (_event, session) => {
            if (!mounted) return;
            setUser(session?.user ?? null);
          },
        );

        unsubscribe = () => sub.subscription.unsubscribe();
      } catch (e) {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : "Auth not configured");
        setIsLoading(false);
      }
    }

    void run();

    return () => {
      mounted = false;
      try {
        unsubscribe?.();
      } catch {}
    };
  }, []);

  return { user, isLoading, isSignedIn: !!user, error };
}
