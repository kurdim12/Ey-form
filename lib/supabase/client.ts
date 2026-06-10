import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config";

/**
 * Browser Supabase client. Uses the public anon key only.
 *
 * createBrowserClient memoizes internally, so repeated calls share the same
 * auth/realtime session within a tab.
 */
export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
