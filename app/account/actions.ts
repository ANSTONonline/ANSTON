"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient, supabaseConfigured } from "@/lib/supabase/server";

export type AuthErrorCode =
  | "invalid"
  | "notConfirmed"
  | "exists"
  | "weakPassword"
  | "rateLimit"
  | "generic";

export type AuthState = { error?: AuthErrorCode; checkEmail?: boolean; email?: string };

// Turns Supabase's error codes into the messages we show (translated on the page).
function toCode(error: { code?: string; message?: string; status?: number }): AuthErrorCode {
  const code = error.code ?? "";
  const message = (error.message ?? "").toLowerCase();
  if (code === "invalid_credentials" || message.includes("invalid login")) return "invalid";
  if (code === "email_not_confirmed" || message.includes("not confirmed")) return "notConfirmed";
  if (code === "user_already_exists" || code === "email_exists" || message.includes("already registered")) return "exists";
  if (code === "weak_password" || message.includes("password should")) return "weakPassword";
  if (code.includes("rate_limit") || error.status === 429) return "rateLimit";
  return "generic";
}

async function siteOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "www.myanston.com";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  if (!supabaseConfigured()) return { error: "generic" };
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: toCode(error), email };
  redirect("/account");
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  if (!supabaseConfigured()) return { error: "generic" };
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  if (password.length < 8) return { error: "weakPassword", email };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: name },
      emailRedirectTo: `${await siteOrigin()}/auth/confirm`,
    },
  });
  if (error) return { error: toCode(error), email };
  // Supabase hides whether an email is already registered: such sign-ups come
  // back with no identities.
  if (data.user && data.user.identities?.length === 0) return { error: "exists", email };
  if (data.session) redirect("/account");
  return { checkEmail: true, email };
}

export async function signOut() {
  if (supabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/account");
}
