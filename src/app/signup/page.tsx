import { SignupTracker } from "@/components/analytics/SignupTracker";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

type Props = {
  searchParams?: Promise<SP>;
};

function getParam(sp: SP, key: string): string | null {
  const v = sp[key];
  if (Array.isArray(v)) return v[0] ?? null;
  return typeof v === "string" ? v : null;
}

const VALID_PERSONAS = ["homeowner", "buyer", "realtor"] as const;
type Persona = (typeof VALID_PERSONAS)[number];

function isValidPersona(p: string | null): p is Persona {
  return p !== null && VALID_PERSONAS.includes(p as Persona);
}

const PERSONA_LABELS: Record<Persona, string> = {
  homeowner: "Homeowner",
  buyer: "Buyer",
  realtor: "Realtor",
};

const PERSONA_DESCRIPTIONS: Record<Persona, string> = {
  homeowner: "Explore a new way to unlock equity without a loan.",
  buyer: "Model a pathway to ownership through shared equity.",
  realtor: "Participate as a referral partner and co-pilot.",
};

export default async function SignupPage({ searchParams }: Props) {
  const sp: SP = searchParams ? await searchParams : {};
  const error = getParam(sp, "error");
  const personaParam = getParam(sp, "persona")?.toLowerCase() ?? null;
  const prefilledPersona = isValidPersona(personaParam) ? personaParam : null;
  const prefilledEmail = getParam(sp, "email") ?? "";
  const returnTo = getParam(sp, "returnTo") ?? "";

  return (
    <main style={{ maxWidth: 560, margin: "40px auto", padding: "0 16px" }}>
      <SignupTracker />
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
        Create your account
      </h1>
      <p style={{ marginTop: 0, marginBottom: 16, opacity: 0.8 }}>
        Sign up to start using FractPath.
      </p>

      {error ? (
        <div style={{
          background: "rgba(255,0,0,0.06)",
          border: "1px solid rgba(255,0,0,0.18)",
          borderRadius: 12,
          padding: 12,
          marginBottom: 12,
        }}>
          <strong>Error:</strong> {decodeURIComponent(error)}
        </div>
      ) : null}

      <div style={{
        border: "1px solid rgba(0,0,0,0.12)",
        borderRadius: 12,
        padding: 16,
        display: "grid",
        gap: 12,
      }}>
        <form method="post" action="/auth/signup" style={{ display: "grid", gap: 10 }}>
          {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 600 }}>Email</span>
            <input
              name="email"
              type="email"
              required
              placeholder="you@example.com"
              autoComplete="email"
              defaultValue={prefilledEmail}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(0,0,0,0.2)",
              }}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 600 }}>Password</span>
            <input
              name="password"
              type="password"
              required
              placeholder="........"
              autoComplete="new-password"
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(0,0,0,0.2)",
              }}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 600 }}>I am a...</span>
            <select
              name="persona"
              required
              defaultValue={prefilledPersona ?? ""}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(0,0,0,0.2)",
                background: "#fff",
              }}
            >
              <option value="" disabled>Select your role</option>
              {VALID_PERSONAS.map((p) => (
                <option key={p} value={p}>
                  {PERSONA_LABELS[p]}
                </option>
              ))}
            </select>
          </label>

          {prefilledPersona && (
            <p style={{ margin: 0, fontSize: 13, opacity: 0.7, fontStyle: "italic" }}>
              {PERSONA_DESCRIPTIONS[prefilledPersona]}
            </p>
          )}

          <button
            type="submit"
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "none",
              background: "#111",
              color: "#fff",
              fontWeight: 700,
              cursor: "pointer",
            }}>
            Create account
          </button>
        </form>

        <p style={{ margin: "4px 0 0", fontSize: 13, opacity: 0.75 }}>
          Already have an account?{" "}
          <a href={`/login${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}${prefilledEmail ? `${returnTo ? "&" : "?"}email=${encodeURIComponent(prefilledEmail)}` : ""}`}>
            Log in
          </a>
        </p>

        <p style={{ margin: "8px 0 0", fontSize: 11, opacity: 0.5 }}>
          Your data is secure. We use industry-standard encryption.
        </p>
      </div>
    </main>
  );
}
