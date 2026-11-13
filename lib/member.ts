import { redirect } from "next/navigation";
import { createClient, supabaseConfigured } from "@/lib/supabase/server";

// The signed-in person, with their Anston profile. A "member" has finished
// setting up their account: they have a username, confirmed they are 18+, and
// agreed to the Terms of Service and Privacy Policy.
export async function getMember() {
  if (!supabaseConfigured()) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("username, display_name, age_confirmed_at, terms_accepted_at, is_suspended")
    .eq("id", user.id)
    .maybeSingle();
  const complete = Boolean(profile?.username && profile?.age_confirmed_at && profile?.terms_accepted_at);
  return { supabase, user, profile, complete };
}

// Use in pages and actions that need a finished account. Anyone else is sent
// to the account page to log in or finish setting up.
export async function requireMember() {
  const member = await getMember();
  if (!member || !member.complete) redirect("/account");
  return member;
}
