import { createBrowserClient } from "@supabase/ssr";

// A Supabase client for the browser, used to upload listing photos straight
// to storage. It uses the same signed-in session as the rest of the site.
export function createBrowserSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  );
}
