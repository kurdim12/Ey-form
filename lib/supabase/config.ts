/**
 * Supabase connection config.
 *
 * These two values are PUBLIC by design — the anon key is shipped inside the
 * browser bundle to every visitor, and RLS is what actually protects the data
 * (anon can only INSERT registrations / upload photos; guest PII is readable
 * only by the authenticated admin). Committing them lets the app build and
 * deploy with zero environment setup.
 *
 * Environment variables, when present, always take precedence — so Vercel /
 * Cloudflare build variables, or a different Supabase project, override these
 * without a code change. The SECRET service role key is never referenced here
 * or anywhere client-reachable.
 */

const DEFAULT_SUPABASE_URL = "https://yhccymfjmeezmgsrgsdf.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InloY2N5bWZqbWVlem1nc3Jnc2RmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMDYyODUsImV4cCI6MjA5NjY4MjI4NX0.BLSvU2s2YHpR4M2TkNx7IoYg2Qq5Ne30mCOeX1rHE4w";

export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;
