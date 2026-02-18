// src/app/protected/layout.tsx
import { redirect } from "next/navigation";
import { supabaseServer } from "../lib/supabaseServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.getUser();

  const user = data?.user ?? null;
  const isAuthed = !error && !!user;

  if (!isAuthed) {
    redirect("/login");
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>Protected</div>
        <div style={{ opacity: 0.8 }}>
          Signed in as <b>{user.email ?? "(no email)"}</b>
        </div>
      </div>
      {children}
    </main>
  );
}
