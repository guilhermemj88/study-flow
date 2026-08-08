import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseConfig } from "@/lib/supabase/config";

let browserClient: SupabaseClient | undefined;

export function createClient(): SupabaseClient {
  if (browserClient) return browserClient;
  const { url, publishableKey } = requireSupabaseConfig();
  browserClient = createBrowserClient(url, publishableKey);
  return browserClient;
}
