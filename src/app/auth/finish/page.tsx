"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/app/lib/supabaseBrowser";

type State =
  | { status: "loading" }
  | { status: "error"; message: string };

export default function AuthFinishPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const rawNext = searchParams.get("next") || "/dashboard";
        const next =
          typeof rawNext === "string" &&
          rawNext.startsWith("/") &&
          !rawNext.startsWith("//") &&
          !rawNext.startsWith("/\\") &&
          !rawNext.includes("://")
            ? rawNext
            : "/dashboard";

        const hash = new URLSearchParams(
          window.location.hash.startsWith("#")
            ? window.location.hash.slice(1)
            : window.location.hash,
        );

        const error =
          hash.get("error_description") ||
          hash.get("error") ||
          searchParams.get("error_description") ||
          searchParams.get("error");

        if (error) {
          if (!cancelled) {
            setState({ status: "error", message: error });
          }
          return;
        }

        const code = searchParams.get("code");

        const access_token = hash.get("access_token");
        const refresh_token = hash.get("refresh_token");

        if (access_token && refresh_token) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });

          if (sessionError) {
            if (!cancelled) {
              setState({ status: "error", message: sessionError.message });
            }
            return;
          }
        } else if (code) {
          const { error: codeError } =
            await supabase.auth.exchangeCodeForSession(code);

          if (codeError) {
            if (!cancelled) {
              setState({ status: "error", message: codeError.message });
            }
            return;
          }
        }

        const { data, error: userError } = await supabase.auth.getUser();

        if (userError || !data?.user) {
          if (!cancelled) {
            setState({
              status: "error",
              message: userError?.message || "Authentication could not be completed.",
            });
          }
          return;
        }

        router.replace(next);
      } catch (err: unknown) {
        if (!cancelled) {
          setState({
            status: "error",
            message: err instanceof Error ? err.message : "Authentication failed.",
          });
        }
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [router, searchParams, supabase]);

  return (
    <main style={{ maxWidth: 560, margin: "40px auto", padding: "0 16px" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
        Finishing sign-in
      </h1>

      {state.status === "loading" ? (
        <p style={{ marginTop: 0, opacity: 0.8 }}>
          Completing authentication and loading your deal…
        </p>
      ) : (
        <div
          style={{
            background: "rgba(255,0,0,0.06)",
            border: "1px solid rgba(255,0,0,0.18)",
            borderRadius: 12,
            padding: 12,
          }}
        >
          <strong>Error:</strong> {state.message}
        </div>
      )}
    </main>
  );
}