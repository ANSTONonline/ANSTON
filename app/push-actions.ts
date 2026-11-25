"use server";

import { createClient, getUser, supabaseConfigured } from "@/lib/supabase/server";

// Used by the "Turn on notifications" prompt in the Anston app.

export async function isSignedIn() {
  return (await getUser()) !== null;
}

// Save this phone's push token for the signed-in member.
export async function registerPushToken(token: string, platform: string): Promise<"saved" | "signed_out" | "error"> {
  if (!supabaseConfigured()) return "error";
  if (platform !== "android" && platform !== "ios") return "error";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "signed_out";
  const { error } = await supabase.rpc("register_push_token", { p_token: token, p_platform: platform });
  return error ? "error" : "saved";
}

// Stop notifications to this phone (it signed out).
export async function forgetPushToken(token: string) {
  if (!supabaseConfigured()) return;
  const supabase = await createClient();
  await supabase.rpc("forget_push_token", { p_token: token });
}
