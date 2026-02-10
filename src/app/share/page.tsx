import { redirect } from "next/navigation";

export default function ShareLandingPage({
  searchParams,
}: {
  searchParams: { t?: string };
}) {
  const t = (searchParams?.t || "").trim();

  // If no token, show a friendly error (we'll improve later).
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

  // MVP behavior: require auth first, preserving the token via returnTo.
  const returnTo = `/share?t=${encodeURIComponent(t)}`;
  redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
}
