export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

type Props = {
  searchParams?: Promise<SP>;
};

function getParam(searchParams: SP | undefined, key: string): string | null {
  const v = searchParams?.[key];
  if (Array.isArray(v)) return v[0] ?? null;
  return typeof v === "string" ? v : null;
}

export default async function VerifyEmailPage({ searchParams }: Props) {
  const sp: SP = searchParams ? await searchParams : {};

  const status = getParam(sp, "status");
  const email = getParam(sp, "email");
  const retryIn = getParam(sp, "retry_in");
  const msg = getParam(sp, "msg") || getParam(sp, "error");

  const isThrottled = status === "throttled";
  const retryInNum = retryIn ? Number(retryIn) : NaN;

  let message = "Please confirm your email to continue.";
  if (status === "sent") message = "Confirmation email sent. Check your inbox.";
  if (status === "resent") message = "Confirmation email resent. Check your inbox.";
  if (status === "error") message = msg ? `Error: ${decodeURIComponent(msg)}` : "Something went wrong.";
  if (status === "timeout") message = msg ? `Timeout: ${decodeURIComponent(msg)}` : "Request timed out. Please try again.";
  if (isThrottled) {
    const n = Number.isFinite(retryInNum) ? retryInNum : null;
    message = n ? `Please wait ${n} seconds before trying again.` : "Please wait a moment before trying again.";
  }

  return (
    <main style={{ maxWidth: 560, margin: "40px auto", padding: "0 16px" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
        Verify your email
      </h1>
      <p style={{ marginTop: 0, marginBottom: 16, opacity: 0.8 }}>{message}</p>

      <div
        style={{
          border: "1px solid rgba(0,0,0,0.12)",
          borderRadius: 12,
          padding: 16,
          display: "grid",
          gap: 12,
        }}
      >
        <div style={{ fontSize: 14, opacity: 0.85, lineHeight: 1.4 }}>
          <div>1) Open the email from Supabase.</div>
          <div>2) Click the confirmation link.</div>
          <div>3) You’ll be redirected back to FractPath.</div>
        </div>

        <hr style={{ border: "none", borderTop: "1px solid rgba(0,0,0,0.12)" }} />

        <form
          method="post"
          action="/auth/resend-confirmation"
          style={{ display: "grid", gap: 10 }}
        >
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 600 }}>Resend confirmation email</span>
            <input
              name="email"
              type="email"
              required
              defaultValue={email ?? ""}
              placeholder="you@example.com"
              autoComplete="email"
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(0,0,0,0.2)",
              }}
            />
          </label>

          <button
            type="submit"
            disabled={isThrottled}
            aria-disabled={isThrottled}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.2)",
              fontWeight: 700,
              cursor: isThrottled ? "not-allowed" : "pointer",
              opacity: isThrottled ? 0.6 : 1,
            }}
          >
            {isThrottled ? "Please wait…" : "Resend email"}
          </button>

          <p style={{ margin: "4px 0 0", fontSize: 13, opacity: 0.75 }}>
            Already confirmed? <a href="/login">Log in</a>
          </p>
        </form>
      </div>
    </main>
  );
}
