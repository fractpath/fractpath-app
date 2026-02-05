import { createSupabasePageClient } from "@/app/lib/supabasePage";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DebugUserPage() {
  const { supabase } = await createSupabasePageClient();
  const { data, error } = await supabase.auth.getUser();

  return (
    <main style={{ maxWidth: 900, margin: "40px auto", padding: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>Debug: auth.getUser()</h1>

      <p style={{ opacity: 0.8 }}>
        If you are logged in, this prints the raw user object the server sees.
      </p>

      <pre
        style={{
          padding: 12,
          borderRadius: 12,
          border: "1px solid rgba(0,0,0,0.12)",
          background: "rgba(0,0,0,0.03)",
          overflowX: "auto",
          fontSize: 12,
          lineHeight: 1.35,
        }}
      >
{JSON.stringify({ error: error ? { message: error.message, name: (error as any).name, status: (error as any).status } : null, user: data?.user ?? null }, null, 2)}
      </pre>

      <p style={{ marginTop: 16 }}>
        <a href="/protected">Go to /protected</a>
      </p>
    </main>
  );
}
