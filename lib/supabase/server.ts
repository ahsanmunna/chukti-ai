import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env";

/**
 * Creates a server-only Supabase client with the service role key.
 * Never import or call this from browser/client modules.
 */
export function createSupabaseAdminClient(): SupabaseClient {
  const env = getServerEnv();
  return createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
