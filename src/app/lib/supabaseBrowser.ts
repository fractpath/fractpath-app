cat > src/app/lib/supabaseBrowser.ts <<'EOF'
// src/app/lib/supabaseBrowser.ts
import { createBrowserClient } from "@supabase/ssr";

function getEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export function supabaseBrowser() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    process.env.SUPABASE_URL ??
    getEnv("NEXT_PUBLIC_SUPABASE_URL");

  const anon =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  return createBrowserClient(url, anon);
}
EOF
