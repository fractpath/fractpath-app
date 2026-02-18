export default async function LoginPage({
  searchParams,
}: {
  searchParams:
    | Record<string, string | string[] | undefined>
    | Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp: any = await searchParams;
  const rtRaw = sp?.returnTo;
  const returnTo = Array.isArray(rtRaw) ? rtRaw[0] || "" : rtRaw || "";
  const safeReturnTo = typeof returnTo === "string" ? returnTo : "";

  const emailRaw = sp?.email;
  const prefilledEmail = typeof emailRaw === "string" ? emailRaw : Array.isArray(emailRaw) ? emailRaw[0] || "" : "";

  return (
    <main style={{ maxWidth: 420, margin: "48px auto", padding: 16 }}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>Login</h1>
      <p style={{ opacity: 0.8, marginBottom: 24 }}>Sign in to continue.</p>

      <form method="post" action="/auth/login">
        <input type="hidden" name="returnTo" value={safeReturnTo} />

        <label style={{ display: "block", marginBottom: 6 }}>Email</label>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={prefilledEmail}
          style={{
            width: "100%",
            padding: 10,
            marginBottom: 16,
            borderRadius: 8,
            border: "1px solid rgba(0,0,0,0.2)",
          }}
        />

        <label style={{ display: "block", marginBottom: 6 }}>Password</label>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          style={{
            width: "100%",
            padding: 10,
            marginBottom: 16,
            borderRadius: 8,
            border: "1px solid rgba(0,0,0,0.2)",
          }}
        />

        <button
          type="submit"
          style={{
            width: "100%",
            padding: 12,
            borderRadius: 10,
            border: "none",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Sign in
        </button>
      </form>

      <p style={{ marginTop: 16, fontSize: 13, opacity: 0.75 }}>
        Don't have an account?{" "}
        <a href={`/signup${safeReturnTo ? `?returnTo=${encodeURIComponent(safeReturnTo)}` : ""}${prefilledEmail ? `${safeReturnTo ? "&" : "?"}email=${encodeURIComponent(prefilledEmail)}` : ""}`}>
          Create one
        </a>
      </p>
    </main>
  );
}
