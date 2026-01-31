"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

export function useSession() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const supabase = createClient();

      supabase.auth.getUser().then(({ data: { user } }) => {
        setUser(user);
        setIsLoading(false);
      });

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user ?? null);
      });

      return () => subscription.unsubscribe();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Auth not configured");
      setIsLoading(false);
    }
  }, []);

  return { user, isLoading, isSignedIn: !!user, error };
}
