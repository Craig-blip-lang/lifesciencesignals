import { createClient } from "@supabase/supabase-js";

// Client (browser)
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Server (API routes / background jobs)
export function supabaseServer() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url) throw new Error("SUPABASE_URL is required.");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY (or anon key) is required.");

  return createClient(url, key);
}


