import "server-only";
import { createClient } from "@supabase/supabase-js";

let _serviceClient: ReturnType<typeof createClient> | null = null;

export function createServiceClient() {
  if (_serviceClient) return _serviceClient;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for service client",
    );
  }

  _serviceClient = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return _serviceClient;
}
