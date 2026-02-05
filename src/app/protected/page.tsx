import { requireUser } from "@/app/lib/supabasePage";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ProtectedPage() {
  const { user } = await requireUser();

  const email = user.email || "(no email)";

  return (
    <main style={{ maxWidth: 720, margin: "48px auto", padding: 16 }}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>Protected</h1>
      <p style={{ opacity: 0.8, marginBottom: 24 }}>
        Signed in as <strong>{email}</strong>
      </p>

      <form method="post" action="/auth/logout">
        <button
          type="submit"
          style={{
            padding: "12px 14px",
            borderRadius: 10,
            border: "none",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Log out
        </button>
      </form>
    </main>
  );
}
