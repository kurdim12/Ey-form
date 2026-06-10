import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client. Uses the public anon key only.
 *
 * One instance per call is fine — createBrowserClient memoizes internally so
 * repeated calls share the same auth/realtime session within a tab.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
        "Copy .env.example to .env.local and fill in your Supabase values."
    );
  }

  return createBrowserClient(url, anonKey);
}
