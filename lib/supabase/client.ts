import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getPublicEnv } from "@/lib/env";

let browserClient: SupabaseClient | null = null;

/**
 * Returns a browser-safe Supabase client using the public anon key.
 */
export function getSupabaseBrowserClient(): SupabaseClient {
  if (!browserClient) {
    const env = getPublicEnv();
    browserClient = createClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    );
  }
  return browserClient;
}
