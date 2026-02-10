import { redirect } from "next/navigation";

type SP =
  | Record<string, string | string[] | undefined>
  | Promise<Record<string, string | string[] | undefined>>;

async function getToken(searchParams: SP): Promise<string> {
  const sp: any = await searchParams; // supports Next versions where searchParams is a Promise
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

  const returnTo = `/share?t=${encodeURIComponent(t)}`;
  redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
}
