import { redirect } from "next/navigation";
import { createSupabasePageClient } from "@/app/lib/supabasePage";

type SP =
  | Record<string, string | string[] | undefined>
  | Promise<Record<string, string | string[] | undefined>>;

async function getToken(searchParams: SP): Promise<string> {
  const sp: any = await searchParams;
  const v = sp?.t;
  if (Array.isArray(v)) return (v[0] || "").trim();
  if (typeof v === "string") return v.trim();
  return "";
}

export default async function ShareLandingPage({
  searchParams,
}: {
  searchParams: SP;
}) {
  const t = await getToken(searchParams);

  if (!t) {
    return (
      <main style={{ maxWidth: 720, margin: "48px auto", padding: "0 16px" }}>
        <h1 style={{ fontSize: 28, marginBottom: 12 }}>
          Open your shared scenario
        </h1>
        <p style={{ lineHeight: 1.6 }}>
          This link is missing a share token. Please request a new share email.
        </p>
      </main>
    );
  }

  const { supabase } = await createSupabasePageClient();

  const { data } = await supabase.auth.getUser();
  const user = data?.user ?? null;

  // Not signed in: preserve token via returnTo
  if (!user) {
    const returnTo = `/share?t=${encodeURIComponent(t)}`;
    redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  }

  // Signed in: stop redirect loop (we'll validate token + load scenario next)
  return (
    <main style={{ maxWidth: 720, margin: "48px auto", padding: "0 16px" }}>
      <h1 style={{ fontSize: 28, marginBottom: 12 }}>
        Open your shared scenario
      </h1>
      <p style={{ lineHeight: 1.6, marginBottom: 12 }}>
        You’re signed in. Next we’ll load the shared scenario using this token:
      </p>
      <code
        style={{
          display: "inline-block",
          padding: "8px 10px",
          borderRadius: 8,
          background: "rgba(0,0,0,0.06)",
        }}
      >
        {t}
      </code>
    </main>
  );
}
